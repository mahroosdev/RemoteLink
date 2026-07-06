package com.nexadigital.remotelink

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.ResultReceiver
import android.util.Log

class MobileScreenShareForegroundService : Service() {
    companion object {
        const val ACTION_START = "com.nexadigital.remotelink.mobile_screen_share.START"
        const val ACTION_STOP = "com.nexadigital.remotelink.mobile_screen_share.STOP"
        const val EXTRA_RESULT_RECEIVER = "result_receiver"
        private const val CHANNEL_ID = "remotelink_mobile_screen_share"
        private const val NOTIFICATION_ID = 47779
        private const val LOG_TAG = "RemoteLinkShareSvc"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startForegroundForProjection(intent)
            ACTION_STOP -> stopSelf()
            else -> startForegroundForProjection(intent)
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopForegroundCompat()
        Log.d(LOG_TAG, "Screen-share foreground service stopped")
        super.onDestroy()
    }

    private fun startForegroundForProjection(intent: Intent?) {
        try {
            createNotificationChannel()
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            sendResult(intent, Activity.RESULT_OK, null)
        } catch (error: Exception) {
            Log.e(LOG_TAG, "Unable to start screen-share foreground service", error)
            sendResult(
                intent,
                Activity.RESULT_CANCELED,
                "Unable to start screen-share foreground service: ${error.message ?: error.javaClass.simpleName}",
            )
            stopSelf()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "RemoteLink screen sharing",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shown while RemoteLink shares the phone screen to the paired PC."
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("RemoteLink screen sharing")
            .setContentText("Phone screen is being shared to your paired PC.")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun sendResult(intent: Intent?, resultCode: Int, message: String?) {
        val receiver = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_RESULT_RECEIVER, ResultReceiver::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent?.getParcelableExtra<ResultReceiver>(EXTRA_RESULT_RECEIVER)
        }
        val data = Bundle().apply {
            if (message != null) putString("message", message)
        }
        receiver?.send(resultCode, data)
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }
}
