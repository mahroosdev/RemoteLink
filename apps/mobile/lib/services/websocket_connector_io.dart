import 'dart:io';

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

Future<void> preflightRemoteLinkTcp(Uri uri, Duration timeout) async {
  final socket = await Socket.connect(uri.host, uri.port, timeout: timeout);
  socket.destroy();
}

WebSocketChannel connectRemoteLinkWebSocket(Uri uri) {
  return IOWebSocketChannel.connect(uri);
}

String remoteLinkWebSocketBackend() => 'io_web_socket_channel';
