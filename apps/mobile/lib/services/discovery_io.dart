import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

class DiscoveryResult {
  final String name;
  final String hostIp;
  final int port;

  const DiscoveryResult({
    required this.name,
    required this.hostIp,
    required this.port,
  });
}

const _discoveryPort = 47778;
const _requestType = 'remotelink_discovery_v1';
const _responseType = 'remotelink_discovery_response_v1';

Future<List<DiscoveryResult>> scanForRemoteLinkDesktops({
  Duration timeout = const Duration(milliseconds: 1400),
}) async {
  final socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
  final found = <String, DiscoveryResult>{};
  StreamSubscription<RawSocketEvent>? subscription;
  try {
    final targets = await _scanTargets();
    final request = utf8.encode(jsonEncode({
      'type': _requestType,
      'client': 'RemoteLink Mobile',
    }));

    socket.broadcastEnabled = true;
    if (kDebugMode) {
      debugPrint('[RemoteLink] Discovery scan started');
      debugPrint(
          '[RemoteLink] Discovery targets: ${targets.map((e) => e.address).join(', ')}');
    }

    for (final target in targets) {
      socket.send(request, target, _discoveryPort);
    }

    subscription = socket.listen((event) {
      if (event != RawSocketEvent.read) return;
      Datagram? datagram;
      while ((datagram = socket.receive()) != null) {
        final result = _parseResponse(datagram!);
        if (result == null) continue;
        found['${result.hostIp}:${result.port}'] = result;
        if (kDebugMode) {
          debugPrint(
              '[RemoteLink] Discovery response received from ${result.hostIp}:${result.port}');
        }
      }
    });

    await Future<void>.delayed(timeout);
  } finally {
    // Always release the socket, even if setup or send throws.
    await subscription?.cancel();
    socket.close();
  }

  if (found.isEmpty && kDebugMode) {
    debugPrint('[RemoteLink] Discovery scan timed out with no desktops');
  }
  return found.values.toList(growable: false);
}

Future<List<InternetAddress>> _scanTargets() async {
  final targets = <String, InternetAddress>{
    InternetAddress('255.255.255.255').address:
        InternetAddress('255.255.255.255'),
  };

  try {
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
    );
    for (final interface in interfaces) {
      for (final address in interface.addresses) {
        final broadcast = _classCBroadcast(address.address);
        if (broadcast != null) {
          targets[broadcast.address] = broadcast;
        }
      }
    }
  } catch (error) {
    if (kDebugMode) {
      debugPrint('[RemoteLink] Discovery interface lookup skipped: $error');
    }
  }

  return targets.values.toList(growable: false);
}

InternetAddress? _classCBroadcast(String address) {
  final parts = address.split('.');
  if (parts.length != 4) return null;
  final numbers = parts.map(int.tryParse).toList(growable: false);
  if (numbers.any((part) => part == null || part < 0 || part > 255)) {
    return null;
  }
  final first = numbers[0]!;
  final second = numbers[1]!;
  final isPrivate = first == 10 ||
      (first == 172 && second >= 16 && second <= 31) ||
      (first == 192 && second == 168);
  if (!isPrivate) return null;
  return InternetAddress('${parts[0]}.${parts[1]}.${parts[2]}.255');
}

DiscoveryResult? _parseResponse(Datagram datagram) {
  try {
    final decoded = jsonDecode(utf8.decode(datagram.data));
    if (decoded is! Map || decoded['type'] != _responseType) return null;
    final port = _readPort(decoded['port']);
    final responseIp = decoded['hostIp']?.toString();
    final hostIp =
        _isUsefulIPv4(responseIp) ? responseIp! : datagram.address.address;
    if (!_isUsefulIPv4(hostIp)) return null;
    return DiscoveryResult(
      name: decoded['appName']?.toString() ?? 'RemoteLink Desktop',
      hostIp: hostIp,
      port: port,
    );
  } catch (_) {
    return null;
  }
}

int _readPort(dynamic value) {
  if (value is int && value > 0 && value <= 65535) return value;
  final parsed = int.tryParse(value?.toString() ?? '');
  return parsed != null && parsed > 0 && parsed <= 65535 ? parsed : 47777;
}

bool _isUsefulIPv4(String? value) {
  if (value == null) return false;
  final parts = value.split('.');
  if (parts.length != 4) return false;
  final numbers = parts.map(int.tryParse).toList(growable: false);
  if (numbers.any((part) => part == null || part < 0 || part > 255)) {
    return false;
  }
  return !value.startsWith('127.') && !value.startsWith('169.254.');
}
