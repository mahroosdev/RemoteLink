import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class TouchpadArea extends StatefulWidget {
  final double height;

  /// UI-only pointer indicator that follows the finger (no real PC mouse).
  final bool showPointer;
  final Function(Offset) onMove;
  final VoidCallback onMoveEnd;
  final ValueChanged<bool>? onTouchActiveChanged;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;
  final VoidCallback onLongPress;
  final VoidCallback? onDragStart;
  final VoidCallback? onDragEnd;

  const TouchpadArea({
    super.key,
    this.height = 150,
    this.showPointer = true,
    required this.onMove,
    required this.onMoveEnd,
    this.onTouchActiveChanged,
    required this.onTap,
    required this.onDoubleTap,
    required this.onLongPress,
    this.onDragStart,
    this.onDragEnd,
  });

  @override
  State<TouchpadArea> createState() => _TouchpadAreaState();
}

class _TouchpadAreaState extends State<TouchpadArea> {
  Offset? _pointer;
  Offset? _lastDragPosition;
  bool _pointerVisible = false;
  bool _dragActive = false;
  Timer? _fadeTimer;

  @override
  void dispose() {
    _fadeTimer?.cancel();
    super.dispose();
  }

  void _placePointer(Offset local, Size bounds) {
    if (!widget.showPointer) return;
    _fadeTimer?.cancel();
    setState(() {
      _pointer = Offset(
        local.dx.clamp(10.0, bounds.width - 10.0),
        local.dy.clamp(10.0, bounds.height - 10.0),
      );
      _pointerVisible = true;
    });
  }

  void _schedulePointerFade() {
    _fadeTimer?.cancel();
    _fadeTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _pointerVisible = false);
    });
  }

  void _setTouchActive(bool active) {
    widget.onTouchActiveChanged?.call(active);
  }

  void _startDrag(Offset local, Size bounds) {
    if (_dragActive) return;
    _dragActive = true;
    _lastDragPosition = local;
    _placePointer(local, bounds);
    widget.onMoveEnd();
    widget.onDragStart?.call();
  }

  void _updateDrag(Offset local, Size bounds) {
    final last = _lastDragPosition;
    _lastDragPosition = local;
    _placePointer(local, bounds);
    if (last == null) return;
    final delta = local - last;
    if (delta.distance == 0) return;
    widget.onMove(delta);
  }

  void _finishDrag() {
    if (!_dragActive) return;
    _dragActive = false;
    _lastDragPosition = null;
    widget.onMoveEnd();
    widget.onDragEnd?.call();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final bounds = Size(constraints.maxWidth, widget.height);
        return Listener(
          onPointerDown: (_) => _setTouchActive(true),
          onPointerUp: (_) {
            _finishDrag();
            _setTouchActive(false);
          },
          onPointerCancel: (_) {
            _finishDrag();
            _setTouchActive(false);
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            dragStartBehavior: DragStartBehavior.down,
            onTapDown: (d) {
              _placePointer(d.localPosition, bounds);
              _schedulePointerFade();
            },
            onPanStart: (d) => _placePointer(d.localPosition, bounds),
            onPanUpdate: (d) {
              _placePointer(d.localPosition, bounds);
              widget.onMove(d.delta);
            },
            onPanEnd: (_) {
              _finishDrag();
              _setTouchActive(false);
              _schedulePointerFade();
              widget.onMoveEnd();
            },
            onPanCancel: () {
              _finishDrag();
              _setTouchActive(false);
              _schedulePointerFade();
              widget.onMoveEnd();
            },
            onTap: widget.onTap,
            onDoubleTap: widget.onDoubleTap,
            onLongPress: widget.onDragStart == null ? widget.onLongPress : null,
            onLongPressStart: widget.onDragStart == null
                ? null
                : (d) => _startDrag(d.localPosition, bounds),
            onLongPressMoveUpdate: widget.onDragStart == null
                ? null
                : (d) => _updateDrag(d.localPosition, bounds),
            onLongPressEnd: widget.onDragStart == null
                ? null
                : (_) {
                    _finishDrag();
                    _setTouchActive(false);
                    _schedulePointerFade();
                  },
            onLongPressCancel: widget.onDragStart == null
                ? null
                : () {
                    _finishDrag();
                    _setTouchActive(false);
                    _schedulePointerFade();
                  },
            child: Semantics(
              label: 'Touchpad area',
              hint: 'Swipe to move. Hold and move to drag.',
              child: Container(
                width: double.infinity,
                height: widget.height,
                decoration: BoxDecoration(
                  color: c.touchpadSurface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: c.touchpadBorder),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Stack(
                    children: [
                      Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.mouse_outlined,
                                color: c.touchpadHint.withValues(alpha: 0.75),
                                size: 36),
                            const SizedBox(height: 8),
                            Text(
                              'TOUCHPAD AREA',
                              style: TextStyle(
                                color: c.touchpadHint,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 2,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (widget.showPointer && _pointer != null)
                        Positioned(
                          left: _pointer!.dx - 9,
                          top: _pointer!.dy - 9,
                          child: AnimatedOpacity(
                            opacity: _pointerVisible ? 1 : 0,
                            duration: const Duration(milliseconds: 350),
                            child: Container(
                              width: 18,
                              height: 18,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: c.blue.withValues(alpha: 0.25),
                                border: Border.all(
                                    color: c.blue.withValues(alpha: 0.8),
                                    width: 1.5),
                              ),
                              child: Center(
                                child: Container(
                                  width: 5,
                                  height: 5,
                                  decoration: BoxDecoration(
                                      shape: BoxShape.circle, color: c.blue),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
