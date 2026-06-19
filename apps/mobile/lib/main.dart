import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app.dart';
import 'models/app_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]).then((_) {
    runZonedGuarded(() {
      FlutterError.onError = (details) {
        FlutterError.presentError(details);
      };
      final state = AppState();
      runApp(RemoteLinkApp(state: state, ownsState: true));
    }, (error, stackTrace) {
      runApp(RemoteLinkStartupError(error: error));
    });
  });
}

class RemoteLinkStartupError extends StatelessWidget {
  final Object error;

  const RemoteLinkStartupError({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RemoteLink',
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF0B0C0F),
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline,
                      color: Color(0xFFEF4444), size: 42),
                  const SizedBox(height: 16),
                  const Text(
                    'RemoteLink could not start',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    error.toString(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Color(0xFF94A3B8), fontSize: 12, height: 1.4),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
