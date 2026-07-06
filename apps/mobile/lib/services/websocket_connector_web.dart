import 'package:web_socket_channel/web_socket_channel.dart';

Future<void> preflightRemoteLinkTcp(Uri uri, Duration timeout) async {
  // Browsers cannot open raw TCP sockets. Opening the local channel is the check.
}

WebSocketChannel connectRemoteLinkWebSocket(Uri uri) {
  return WebSocketChannel.connect(uri);
}

String remoteLinkWebSocketBackend() => 'web_socket_channel';
