import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/app_logo.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_pill.dart';
import '../models/app_state.dart';
import '../services/pairing_service.dart';

class ConnectScreen extends StatefulWidget {
  final AppState state;
  final VoidCallback onConnected;
  const ConnectScreen(
      {super.key, required this.state, required this.onConnected});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _ipController = TextEditingController();
  final _codeController = TextEditingController();
  bool _isScanning = false;
  bool _showAdvancedDetails = false;

  /// True once a scan finished without finding a desktop.
  bool _scanFoundNothing = false;

  /// Local status-pill note shown while disconnected:
  /// 'NO DESKTOP FOUND' after an empty scan. Cleared when a connect
  /// attempt starts.
  String? _statusNote;

  static final _ipv4Pattern = RegExp(r'^\d{1,3}(\.\d{1,3}){3}$');
  static final _hostPattern = RegExp(r'^[a-zA-Z0-9.-]+$');
  static final _codePattern = RegExp(r'^\d{6}$');

  @override
  void initState() {
    super.initState();
    _ipController.text = widget.state.hostIp;
    _codeController.text = widget.state.pairingCode;
  }

  @override
  void dispose() {
    _ipController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _showSnack(String message, Color color) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w500)),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ));
  }

  bool _isValidHost(String host) {
    if (host.isEmpty || host.length > 253 || !_hostPattern.hasMatch(host)) {
      return false;
    }
    if (_ipv4Pattern.hasMatch(host)) {
      return host
          .split('.')
          .every((octet) => (int.tryParse(octet) ?? 256) <= 255);
    }
    if (!host.contains('.')) return false;
    return host.split('.').every((part) =>
        part.isNotEmpty && !part.startsWith('-') && !part.endsWith('-'));
  }

  String? _hostIpWarning(String ip) {
    final value = normalizeRemoteLinkHost(ip);
    if (value.startsWith('192.168.56.') ||
        value.startsWith('127.') ||
        value.startsWith('169.254.')) {
      return 'This looks like a virtual or local-only IP. Use your Wi-Fi/hotspot IP instead.';
    }
    return null;
  }

  Future<void> _connect() async {
    final ip = normalizeRemoteLinkHost(_ipController.text);
    final code = _codeController.text.trim();

    if (!_isValidHost(ip)) {
      _showSnack(
          'Enter a valid Host IP, e.g. 192.168.0.24', context.colors.red);
      return;
    }
    if (!_codePattern.hasMatch(code)) {
      _showSnack('Pairing Code must be exactly 6 digits', context.colors.red);
      return;
    }

    setState(() => _statusNote = null);
    _ipController.text = ip;
    await widget.state.connect(ip, code);
    if (!mounted) return;
    if (!widget.state.isConnected) {
      _showSnack(
        _friendlyConnectionMessage(widget.state.lastConnectionError),
        context.colors.red,
      );
      return;
    }
    _showSnack('Connected to PC locally', context.colors.green);
    widget.onConnected();
  }

  Future<void> _scanDevices() async {
    setState(() {
      _isScanning = true;
      _scanFoundNothing = false;
      _statusNote = null;
    });
    final results = await widget.state.scanForDesktops();
    if (!mounted) return;
    if (results.isEmpty) {
      setState(() {
        _isScanning = false;
        _scanFoundNothing = true;
        _statusNote = 'NO DESKTOP FOUND';
      });
      return;
    }

    final desktop = results.first;
    _ipController.text = desktop.hostIp;
    widget.state.setHostIp(desktop.hostIp);
    setState(() {
      _isScanning = false;
      _scanFoundNothing = false;
      _statusNote = 'DESKTOP FOUND';
    });
    _showSnack(
        'Found ${desktop.name} at ${desktop.hostIp}', context.colors.green);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: widget.state,
          builder: (context, _) {
            final c = context.colors;
            final isConnected = widget.state.isConnected;
            final isConnecting =
                widget.state.status == ConnectionStatus.connecting ||
                    widget.state.status == ConnectionStatus.waitingApproval;

            final form = _buildForm(context, c, isConnected, isConnecting);
            final statusCard =
                _buildStatusCard(context, c, isConnected, isConnecting);

            return LayoutBuilder(
              builder: (context, constraints) {
                if (constraints.maxWidth >= 720) {
                  // Landscape / wide: form beside the status card.
                  return SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 32.0, vertical: 24.0),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 920),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                                child: ConstrainedBox(
                                    constraints:
                                        const BoxConstraints(maxWidth: 420),
                                    child: form)),
                            const SizedBox(width: 48),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 24),
                                child: ConstrainedBox(
                                    constraints:
                                        const BoxConstraints(maxWidth: 380),
                                    child: statusCard),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 32.0, vertical: 48.0),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Column(
                        children: [
                          form,
                          const SizedBox(height: 48),
                          statusCard,
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildForm(
      BuildContext context, AppColors c, bool isConnected, bool isConnecting) {
    final hostIpWarning = _hostIpWarning(_ipController.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const AppLogo(size: 100),
        const SizedBox(height: 32),
        Text('REMOTELINK',
            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  letterSpacing: -0.5,
                  fontWeight: FontWeight.w700,
                )),
        const SizedBox(height: 4),
        Text('PRO UTILITY',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  letterSpacing: 1.5,
                  color: c.blue.withValues(alpha: 0.8),
                  fontWeight: FontWeight.w600,
                )),
        const SizedBox(height: 48),
        TextField(
          controller: _ipController,
          onChanged: (value) {
            widget.state.setHostIp(value);
            setState(() {});
          },
          decoration: const InputDecoration(
            labelText: 'PC Host IP',
            hintText: 'Enter PC Host IP',
            helperText:
                'Use the Recommended Host IP from the desktop app. If the phone cannot connect, try another detected LAN IP.',
            helperMaxLines: 2,
            prefixIcon: Icon(Icons.wifi, size: 20),
          ),
        ),
        if (hostIpWarning != null) ...[
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.warning_amber_rounded, size: 16, color: c.amber),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  hostIpWarning,
                  style: TextStyle(color: c.amber, fontSize: 11, height: 1.35),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: _codeController,
          onChanged: widget.state.setPairingCode,
          decoration: const InputDecoration(
            labelText: 'Pairing Code',
            hintText: '6-digit code',
            prefixIcon: Icon(Icons.lock_outline, size: 20),
          ),
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: 32),
        if (!isConnected) ...[
          PrimaryButton(
            label: isConnecting ? 'Connecting...' : 'Connect to PC',
            onPressed: isConnecting ? null : _connect,
          ),
          const SizedBox(height: 16),
          if (_isScanning)
            Column(
              children: [
                CircularProgressIndicator(strokeWidth: 2, color: c.blue),
                const SizedBox(height: 8),
                Text('Scanning local network...',
                    style: TextStyle(fontSize: 12, color: c.textMuted)),
              ],
            )
          else ...[
            if (_scanFoundNothing) ...[
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                decoration: BoxDecoration(
                  color: c.card,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: c.border),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: c.amber.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(Icons.search_off, size: 16, color: c.amber),
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'No desktop found',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: c.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Use the Recommended Host IP.\nSome hotspots block scan.',
                            style: TextStyle(
                              fontSize: 11.5,
                              height: 1.35,
                              color: c.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
            TextButton(
              onPressed: _scanDevices,
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search, size: 18),
                  SizedBox(width: 8),
                  Flexible(
                      child: Text('Scan for local devices',
                          overflow: TextOverflow.ellipsis)),
                ],
              ),
            ),
          ],
        ] else ...[
          PrimaryButton(
            label: 'Disconnect from PC',
            isDanger: true,
            onPressed: () => widget.state.disconnect(),
          ),
        ],
      ],
    );
  }

  Widget _buildStatusCard(
      BuildContext context, AppColors c, bool isConnected, bool isConnecting) {
    final connectionError = widget.state.lastConnectionError;
    final hasConnectionError =
        connectionError != null && connectionError.isNotEmpty;
    final friendlyError = _friendlyConnectionMessage(connectionError);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text('System Status',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontWeight: FontWeight.w600, color: c.textPrimary)),
              ),
              StatusPill(
                label: isConnected || isConnecting
                    ? _statusLabel(widget.state.status)
                    : (_statusNote ?? widget.state.status.name),
                color: isConnected
                    ? c.green
                    : isConnecting
                        ? c.amber
                        : _statusNote == 'DESKTOP FOUND'
                            ? c.green
                            : _statusNote == 'NO DESKTOP FOUND' ||
                                    widget.state.status ==
                                        ConnectionStatus.denied ||
                                    widget.state.status ==
                                        ConnectionStatus.failed
                                ? c.amber
                                : c.textMuted,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            // ‑ = non-breaking hyphen so "Wi-Fi" never splits across lines.
            'Ensure your PC and phone are on the same Wi‑Fi network before connecting.',
            textAlign: TextAlign.center,
            style: TextStyle(color: c.textMuted, fontSize: 12, height: 1.4),
          ),
          if (hasConnectionError) ...[
            const SizedBox(height: 12),
            Text(
              friendlyError,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: c.textPrimary,
                  fontSize: 13,
                  height: 1.4,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            _buildConnectionTips(c),
            const SizedBox(height: 10),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 6,
              children: [
                TextButton(
                  onPressed: isConnecting ? null : _connect,
                  child: const Text('Retry'),
                ),
                TextButton(
                  onPressed: isConnecting || _isScanning ? null : _scanDevices,
                  child: const Text('Scan again'),
                ),
                TextButton(
                  onPressed: () {
                    setState(
                        () => _showAdvancedDetails = !_showAdvancedDetails);
                  },
                  child: Text(_showAdvancedDetails
                      ? 'Hide advanced details'
                      : 'Advanced details'),
                ),
              ],
            ),
            if (_showAdvancedDetails) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: c.card,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: c.border),
                ),
                child: Text(
                  _publicAdvancedConnectionDetails(connectionError),
                  style: TextStyle(
                    color: c.textMuted,
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'Manual setup: open the desktop app, turn Engine Online, use the Recommended Host IP, then approve the request on the PC.',
              textAlign: TextAlign.center,
              style: TextStyle(color: c.textMuted, fontSize: 11, height: 1.35),
            ),
          ],
        ],
      ),
    );
  }

  String _statusLabel(ConnectionStatus status) {
    switch (status) {
      case ConnectionStatus.waitingApproval:
        return 'WAITING APPROVAL';
      case ConnectionStatus.connecting:
        return 'CONNECTING';
      case ConnectionStatus.connected:
        return 'CONNECTED';
      case ConnectionStatus.denied:
        return 'DENIED';
      case ConnectionStatus.failed:
        return 'FAILED';
      case ConnectionStatus.disconnected:
        return 'DISCONNECTED';
    }
  }

  Widget _buildConnectionTips(AppColors c) {
    final tips = [
      'Make sure the desktop app is open and Engine Online.',
      'Make sure both devices are on the same Wi-Fi or hotspot.',
      'Windows Firewall may be blocking RemoteLink.',
      'Try the Recommended Host IP from the desktop app.',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: tips
          .map((tip) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('• ',
                        style: TextStyle(color: c.textMuted, fontSize: 11)),
                    Expanded(
                      child: Text(
                        tip,
                        style: TextStyle(
                            color: c.textMuted, fontSize: 11, height: 1.3),
                      ),
                    ),
                  ],
                ),
              ))
          .toList(growable: false),
    );
  }

  String _friendlyConnectionMessage(String? technicalError) {
    final value = technicalError ?? '';
    if (value.toLowerCase().contains('pairing code')) {
      return 'Pairing code mismatch.';
    }
    if (value.toLowerCase().contains('denied')) {
      return 'Pairing was denied on the PC.';
    }
    if (value.toLowerCase().contains('closed by desktop')) {
      return 'The PC closed the connection.';
    }
    return 'Cannot reach the PC.';
  }

  String _publicAdvancedConnectionDetails(String? technicalError) {
    final value = technicalError ?? '';
    if (value.toLowerCase().contains('pairing code')) {
      return 'Pairing code mismatch.\nRe-enter the 6-digit code shown in the desktop app.';
    }
    if (value.toLowerCase().contains('denied')) {
      return 'Pairing was denied on the PC.\nApprove the request on the desktop app to continue.';
    }
    return 'Connection check failed.\n'
        'The phone could not reach the desktop app.\n'
        'Check that both devices are on the same Wi-Fi or hotspot.\n'
        'If scan fails, enter the Recommended Host IP manually.';
  }
}
