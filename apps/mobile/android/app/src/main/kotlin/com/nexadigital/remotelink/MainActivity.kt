package com.nexadigital.remotelink

import android.app.Activity
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.ResultReceiver
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.Surface
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class MainActivity : FlutterActivity() {
    private val logTag = "RemoteLinkShare"
    private val methodChannelName = "remotelink/mobile_screen_share"
    private val eventChannelName = "remotelink/mobile_screen_share_events"
    private val captureRequestCode = 9042

    private var methodChannel: MethodChannel? = null
    private var eventSink: EventChannel.EventSink? = null
    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var projectionCallback: MediaProjection.Callback? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var sharing = false
    private var shareRequested = false
    private var targetWidth = 0
    private var targetHeight = 0
    private var requestedMaxWidth = 720
    private var requestedMaxHeight = 1280
    private var jpegQuality = 70
    private var maxFrameRate = 6
    private var lastFrameAtMs = 0L
    private var lastGeometryCheckMs = 0L
    private var emittedFrameCount = 0
    private var lastEmittedFrameWidth = 0
    private var lastEmittedFrameHeight = 0
    private var currentShareRequestId = 0
    private val frameInFlight = AtomicBoolean(false)

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        mediaProjectionManager =
            getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, methodChannelName)
        methodChannel?.setMethodCallHandler(::handleMethodCall)

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, eventChannelName)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    eventSink = events
                }

                override fun onCancel(arguments: Any?) {
                    eventSink = null
                }
            })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mediaProjectionManager =
            getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (sharing) {
            handler?.post {
                recreateCaptureSurfaceIfNeeded("orientation changed")
            }
        } else if (shareRequested && updateTargetSizeFromDisplay()) {
            emitStatus("starting", "Phone orientation changed", targetWidth, targetHeight, currentShareRequestId)
        }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != captureRequestCode) return

        if (resultCode == Activity.RESULT_OK && data != null) {
            if (!shareRequested) {
                Log.d(logTag, "Screen capture approval returned after request was cleared")
                emitStatus("stopped", "Screen share request was cancelled")
                return
            }
            Log.d(logTag, "Android screen capture consent approved")
            beginForegroundThenStartCapture(resultCode, data)
        } else {
            Log.d(logTag, "Android screen capture consent cancelled")
            shareRequested = false
            emitStatus("stopped", "Screen capture consent was cancelled")
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN && (sharing || shareRequested)) {
            Log.d(logTag, "UI hidden while screen sharing; capture remains active")
        }
    }

    override fun onDestroy() {
        stopSharing("Activity destroyed")
        super.onDestroy()
    }

    private fun handleMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "startShare" -> handleStartShare(call, result)
            "stopShare" -> {
                val requestId = call.argument<Number>("requestId")?.toInt() ?: currentShareRequestId
                stopSharing("Stopped by user", requestId)
                result.success(mapOf("ok" to true))
            }
            else -> result.notImplemented()
        }
    }

    private fun handleStartShare(call: MethodCall, result: MethodChannel.Result) {
        try {
            val requestedRequestId = call.argument<Number>("requestId")?.toInt()
            if (sharing || shareRequested) {
                if (requestedRequestId != null && requestedRequestId > 0) {
                    currentShareRequestId = requestedRequestId
                }
                emitStatus(
                    if (sharing) "sharing" else "starting",
                    if (sharing) "Phone screen is live" else "Screen share request is already starting",
                    targetWidth.takeIf { it > 0 },
                    targetHeight.takeIf { it > 0 },
                    currentShareRequestId,
                )
                result.success(
                    mapOf(
                        "accepted" to true,
                        "status" to if (sharing) "sharing" else "starting",
                        "requestId" to currentShareRequestId,
                    )
                )
                return
            }

            currentShareRequestId = requestedRequestId?.takeIf { it > 0 }
                ?: (currentShareRequestId + 1)
            val displaySize = currentDisplaySize()
            if (displaySize == null) {
                val message = "Unable to determine capture size"
                emitStatus("error", message)
                result.success(mapOf("accepted" to false, "error" to message))
                return
            }

            requestedMaxWidth = (call.argument<Number>("maxWidth")?.toInt() ?: 720).coerceAtLeast(320)
            requestedMaxHeight = (call.argument<Number>("maxHeight")?.toInt() ?: 1280).coerceAtLeast(320)
            jpegQuality = (call.argument<Number>("jpegQuality")?.toInt() ?: 70).coerceIn(50, 85)
            maxFrameRate = (call.argument<Number>("fps")?.toInt() ?: 6).coerceIn(3, 10)
            updateTargetSizeFromDisplay(force = true)
            if (targetWidth <= 0 || targetHeight <= 0) {
                val message = "Unable to determine capture size"
                result.success(mapOf("accepted" to false, "error" to message))
                emitStatus("error", message)
                return
            }

            val intent = mediaProjectionManager?.createScreenCaptureIntent()
            if (intent == null) {
                val message = "Screen capture manager unavailable"
                result.success(mapOf("accepted" to false, "error" to message))
                emitStatus("error", message)
                return
            }

            shareRequested = true
            emitStatus(
                "starting",
                "Requesting Android screen capture consent",
                targetWidth,
                targetHeight,
                currentShareRequestId,
            )
            Log.d(logTag, "Android screen capture consent requested")
            startActivityForResult(intent, captureRequestCode)
            result.success(
                mapOf(
                    "accepted" to true,
                    "status" to "starting",
                    "requestId" to currentShareRequestId,
                )
            )
        } catch (error: Exception) {
            val message = "Screen capture request failed: ${error.message ?: error.javaClass.simpleName}"
            Log.e(logTag, message, error)
            shareRequested = false
            sharing = false
            stopCaptureOnly()
            stopProjectionForegroundService()
            emitStatus("error", message, requestId = currentShareRequestId)
            result.success(mapOf("accepted" to false, "error" to message))
        }
    }

    private fun beginForegroundThenStartCapture(resultCode: Int, data: Intent) {
        try {
            emitStatus(
                "starting",
                "Starting screen-share foreground service",
                targetWidth,
                targetHeight,
                currentShareRequestId,
            )
            val receiver = object : ResultReceiver(Handler(mainLooper)) {
                override fun onReceiveResult(resultCodeFromService: Int, resultData: Bundle?) {
                    if (!shareRequested) {
                        stopProjectionForegroundService()
                        emitStatus("stopped", "Screen share request was cancelled", requestId = currentShareRequestId)
                        return
                    }
                    if (resultCodeFromService == Activity.RESULT_OK) {
                        startCapture(resultCode, data)
                    } else {
                        val message = resultData?.getString("message")
                            ?: "Screen-share foreground service could not start"
                        failShare(message)
                    }
                }
            }
            val serviceIntent = Intent(this, MobileScreenShareForegroundService::class.java)
                .setAction(MobileScreenShareForegroundService.ACTION_START)
                .putExtra(MobileScreenShareForegroundService.EXTRA_RESULT_RECEIVER, receiver)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (error: Exception) {
            failShare("Screen-share foreground service failed: ${error.message ?: error.javaClass.simpleName}", error)
        }
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        try {
            startCaptureGuarded(resultCode, data)
        } catch (error: Exception) {
            failShare("Android screen capture could not start: ${error.message ?: error.javaClass.simpleName}", error)
        }
    }

    private fun startCaptureGuarded(resultCode: Int, data: Intent) {
        stopCaptureOnly()
        val manager = mediaProjectionManager ?: run {
            failShare("Screen capture manager unavailable")
            return
        }
        val projection = manager.getMediaProjection(resultCode, data) ?: run {
            failShare("Android denied screen capture")
            return
        }

        mediaProjection = projection
        handlerThread = HandlerThread("RemoteLinkScreenShare").also { it.start() }
        handler = Handler(handlerThread!!.looper)
        val callback = object : MediaProjection.Callback() {
            override fun onStop() {
                runOnUiThread {
                    stopSharing("Android stopped screen capture")
                }
            }
        }
        projectionCallback = callback
        projection.registerCallback(callback, handler)

        if (!createCaptureSurface(projection, "initial start")) {
            return
        }
        sharing = true
        shareRequested = false
        lastFrameAtMs = 0L
        emittedFrameCount = 0
        Log.d(logTag, "Native capture started ${targetWidth}x${targetHeight} at ${maxFrameRate}fps")
        emitStatus("sharing", "Phone screen is live", targetWidth, targetHeight, currentShareRequestId)
    }

    private fun updateTargetSizeFromDisplay(): Boolean {
        return updateTargetSizeFromDisplay(force = false)
    }

    private fun updateTargetSizeFromDisplay(force: Boolean): Boolean {
        val displaySize = currentDisplaySize() ?: return false
        val displayWidth = displaySize.first
        val displayHeight = displaySize.second
        val longLimit = max(requestedMaxWidth, requestedMaxHeight)
        val shortLimit = min(requestedMaxWidth, requestedMaxHeight)
        val limitWidth = if (displayWidth >= displayHeight) longLimit else shortLimit
        val limitHeight = if (displayWidth >= displayHeight) shortLimit else longLimit
        val ratio = min(
            limitWidth.toFloat() / displayWidth.toFloat(),
            limitHeight.toFloat() / displayHeight.toFloat(),
        ).coerceAtMost(1f)
        val nextWidth = max(320, (displayWidth * ratio).roundToInt())
        val nextHeight = max(320, (displayHeight * ratio).roundToInt())
        val changed = nextWidth != targetWidth || nextHeight != targetHeight
        if (changed || force) {
            Log.d(
                logTag,
                "Capture target recalculated from display ${displayWidth}x${displayHeight}: ${targetWidth}x${targetHeight} -> ${nextWidth}x${nextHeight}",
            )
        }
        targetWidth = nextWidth
        targetHeight = nextHeight
        return changed || force
    }

    private fun currentDisplaySize(): Pair<Int, Int>? {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        val display = windowManager.defaultDisplay
        @Suppress("DEPRECATION")
        display.getRealMetrics(metrics)
        if (metrics.widthPixels <= 0 || metrics.heightPixels <= 0) {
            @Suppress("DEPRECATION")
            display.getMetrics(metrics)
        }
        if (metrics.widthPixels <= 0 || metrics.heightPixels <= 0) return null
        val longSide = max(metrics.widthPixels, metrics.heightPixels)
        val shortSide = min(metrics.widthPixels, metrics.heightPixels)
        @Suppress("DEPRECATION")
        return when (display.rotation) {
            Surface.ROTATION_90, Surface.ROTATION_270 -> Pair(longSide, shortSide)
            else -> Pair(shortSide, longSide)
        }
    }

    private fun createCaptureSurface(projection: MediaProjection, reason: String): Boolean {
        releaseCaptureSurfaceOnly()
        if (targetWidth <= 0 || targetHeight <= 0) {
            if (!updateTargetSizeFromDisplay()) return false
        }
        imageReader = ImageReader.newInstance(targetWidth, targetHeight, PixelFormat.RGBA_8888, 2)
        imageReader?.setOnImageAvailableListener({ reader ->
            captureFrame(reader)
        }, handler)

        val densityDpi = resources.displayMetrics.densityDpi
        try {
            virtualDisplay = projection.createVirtualDisplay(
                "RemoteLinkMobileScreen",
                targetWidth,
                targetHeight,
                densityDpi,
                0,
                imageReader?.surface,
                null,
                handler,
            )
        } catch (error: Exception) {
            failShare("Native capture failed to start: ${error.message ?: error.javaClass.simpleName}", error)
            return false
        }
        if (virtualDisplay == null) {
            failShare("Native capture failed to create virtual display")
            return false
        }
        Log.d(logTag, "Capture surface ready ${targetWidth}x${targetHeight}: $reason")
        return true
    }

    private fun recreateCaptureSurfaceIfNeeded(reason: String): Boolean {
        if (!sharing) return false
        val previousWidth = targetWidth
        val previousHeight = targetHeight
        if (!updateTargetSizeFromDisplay()) return false
        val projection = mediaProjection ?: return false
        lastFrameAtMs = 0L
        emittedFrameCount = 0
        if (!createCaptureSurface(projection, reason)) return false
        Log.d(logTag, "Capture size changed ${previousWidth}x${previousHeight} -> ${targetWidth}x${targetHeight}")
        emitStatus("sharing", "Phone orientation changed", targetWidth, targetHeight, currentShareRequestId)
        return true
    }

    private fun releaseCaptureSurfaceOnly() {
        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
        }
        virtualDisplay = null

        try {
            imageReader?.setOnImageAvailableListener(null, null)
            imageReader?.close()
        } catch (_: Exception) {
        }
        imageReader = null
        frameInFlight.set(false)
        lastEmittedFrameWidth = 0
        lastEmittedFrameHeight = 0
    }

    private fun captureFrame(reader: ImageReader) {
        if (!sharing) {
            reader.acquireLatestImage()?.close()
            return
        }
        val now = System.currentTimeMillis()
        if (now - lastGeometryCheckMs > 500) {
            lastGeometryCheckMs = now
            if (recreateCaptureSurfaceIfNeeded("display size changed")) {
                reader.acquireLatestImage()?.close()
                return
            }
        }
        if (!frameInFlight.compareAndSet(false, true)) {
            reader.acquireLatestImage()?.close()
            return
        }

        if (lastFrameAtMs > 0 && now - lastFrameAtMs < (1000L / maxFrameRate)) {
            reader.acquireLatestImage()?.close()
            frameInFlight.set(false)
            return
        }

        try {
            val image = reader.acquireLatestImage() ?: return
            try {
                val currentImage = image
                val plane = currentImage.planes[0]
                val buffer = plane.buffer
                val pixelStride = plane.pixelStride
                val rowStride = plane.rowStride
                if (pixelStride <= 0 || rowStride <= 0) {
                    throw IllegalStateException("Invalid screen frame buffer")
                }
                val rowPadding = max(0, rowStride - pixelStride * currentImage.width)
                val bitmapWidth = currentImage.width + rowPadding / pixelStride
                val bitmap = Bitmap.createBitmap(bitmapWidth, currentImage.height, Bitmap.Config.ARGB_8888)
                var cropped: Bitmap? = null
                try {
                    buffer.rewind()
                    bitmap.copyPixelsFromBuffer(buffer)
                    cropped = Bitmap.createBitmap(bitmap, 0, 0, currentImage.width, currentImage.height)
                    val stream = ByteArrayOutputStream()
                    cropped.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)
                    val encoded = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                    lastFrameAtMs = now
                    emitFrame(
                        mapOf(
                            "type" to "frame",
                            "format" to "jpeg",
                            "width" to currentImage.width,
                            "height" to currentImage.height,
                            "data" to encoded,
                            "timestamp" to System.currentTimeMillis().toString(),
                            "requestId" to currentShareRequestId,
                        )
                    )
                    if (lastEmittedFrameWidth > 0 &&
                        (lastEmittedFrameWidth != currentImage.width || lastEmittedFrameHeight != currentImage.height)
                    ) {
                        Log.d(
                            logTag,
                            "Frame metadata updated ${lastEmittedFrameWidth}x${lastEmittedFrameHeight} -> ${currentImage.width}x${currentImage.height}",
                        )
                    }
                    lastEmittedFrameWidth = currentImage.width
                    lastEmittedFrameHeight = currentImage.height
                    emittedFrameCount += 1
                    if (emittedFrameCount == 1 || emittedFrameCount % 30 == 0) {
                        Log.d(logTag, "Native frame emitted ${currentImage.width}x${currentImage.height}")
                    }
                } finally {
                    cropped?.recycle()
                    bitmap.recycle()
                }
            } finally {
                image.close()
            }
        } catch (error: Exception) {
            val message = "Failed to capture screen frame: ${error.message ?: error.javaClass.simpleName}"
            Log.e(logTag, message, error)
            runOnUiThread {
                failShare(message)
            }
        } finally {
            frameInFlight.set(false)
        }
    }

    private fun failShare(message: String, error: Exception? = null) {
        if (error != null) {
            Log.e(logTag, message, error)
        } else {
            Log.e(logTag, message)
        }
        shareRequested = false
        sharing = false
        stopCaptureOnly()
        stopProjectionForegroundService()
        emitStatus("error", message)
    }

    private fun stopSharing(reason: String, requestId: Int = currentShareRequestId) {
        Log.d(logTag, "Screen sharing stopped: $reason")
        if (!sharing && !shareRequested) {
            stopCaptureOnly()
            Log.d(logTag, "Native capture stopped")
            stopProjectionForegroundService()
            emitStatus("stopped", reason, requestId = requestId)
            return
        }
        shareRequested = false
        sharing = false
        stopCaptureOnly()
        Log.d(logTag, "Native capture stopped")
        stopProjectionForegroundService()
        emitStatus("stopped", reason, requestId = requestId)
    }

    private fun stopCaptureOnly() {
        releaseCaptureSurfaceOnly()
        val projection = mediaProjection
        val callback = projectionCallback
        mediaProjection = null
        projectionCallback = null
        if (projection != null && callback != null) {
            try {
                projection.unregisterCallback(callback)
            } catch (_: Exception) {
            }
        }
        try {
            projection?.stop()
        } catch (_: Exception) {
        }

        try {
            handlerThread?.quitSafely()
        } catch (_: Exception) {
        }
        handlerThread = null
        handler = null
        frameInFlight.set(false)
        lastFrameAtMs = 0L
        emittedFrameCount = 0
        lastEmittedFrameWidth = 0
        lastEmittedFrameHeight = 0
    }

    private fun stopProjectionForegroundService() {
        try {
            Log.d(logTag, "Foreground service stop requested")
            stopService(Intent(this, MobileScreenShareForegroundService::class.java))
        } catch (error: Exception) {
            Log.w(logTag, "Failed to stop screen-share foreground service", error)
        }
    }

    private fun emitStatus(
        status: String,
        message: String? = null,
        width: Int? = null,
        height: Int? = null,
        requestId: Int? = currentShareRequestId,
    ) {
        emitEvent(
            mapOf(
                "type" to "status",
                "status" to status,
                "message" to message,
                "width" to width,
                "height" to height,
                "requestId" to requestId,
            ).filterValues { it != null }
        )
    }

    private fun emitFrame(payload: Map<String, Any?>) {
        emitEvent(payload)
    }

    private fun emitEvent(payload: Map<String, Any?>) {
        runOnUiThread {
            eventSink?.success(payload)
        }
    }
}
