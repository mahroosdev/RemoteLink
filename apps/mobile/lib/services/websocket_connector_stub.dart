import 'package:web_socket_channel/web_socket_channel.dart';

Future<void> preflightRemoteLinkTcp(Uri uri, Duration timeout) async {
  throw UnsupportedError('Connection check is not available on this platform');
}

WebSocketChannel connectRemoteLinkWebSocket(Uri uri) {
  throw UnsupportedError('Local connection is not available on this platform');
}

String remoteLinkWebSocketBackend() => 'unsupported';
