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

Future<List<DiscoveryResult>> scanForRemoteLinkDesktops({
  Duration timeout = const Duration(milliseconds: 1400),
}) async {
  return const [];
}
