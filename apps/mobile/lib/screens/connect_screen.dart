import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/app_logo.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_pill.dart';
import '../models/app_state.dart';

class ConnectScreen extends StatefulWidget {
  final AppState state;
  final VoidCallback onConnected;
  const ConnectScreen({super.key, required this.state, required this.onConnected});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _ipController = TextEditingController();
  final _codeController = TextEditingController();
  bool _isScanning = false;

  /// True once a scan finished without finding a desktop (always the case
  /// until real discovery exists — scans never fabricate a result).
  bool _scanFoundNothing = false;

  /// Local status-pill note shown while disconnected:
  /// 'NO DESKTOP FOUND' after an empty scan. Cleared when a connect
  /// attempt starts.
  String? _statusNote;

  static final _ipv4Pattern = RegExp(r'^\d{1,3}(\.\d{1,3}){3}$');
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
        content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ));
  }

  bool _isValidIp(String ip) {
    if (!_ipv4Pattern.hasMatch(ip)) return false;
    return ip.split('.').every((octet) => (int.tryParse(octet) ?? 256) <= 255);
  }

  Future<void> _connect() async {
    final ip = _ipController.text.trim();
    final code = _codeController.text.trim();

    if (!_isValidIp(ip)) {
      _showSnack('Enter a valid Host IP, e.g. 192.168.0.24', context.colors.red);
      return;
    }
    if (!_codePattern.hasMatch(code)) {
      _showSnack('Pairing Code must be exactly 6 digits', context.colors.red);
      return;
    }

    setState(() => _statusNote = null);
    await widget.state.connect(ip, code);
    if (!mounted) return;
    if (!widget.state.isConnected) {
      _showSnack(
        widget.state.lastConnectionError ??
            'Connection failed. Start desktop app, turn engine ON, check Host IP, same Wi-Fi, and firewall.',
        context.colors.red,
      );
      return;
    }
    _showSnack('Connected to PC locally', context.colors.green);
    widget.onConnected();
  }

  void _scanDevices() {
    setState(() {
      _isScanning = true;
      _scanFoundNothing = false;
      _statusNote = null;
    });
    widget.state.addLog('Scanning local network for devices...');

    // Honest result: until local discovery/pairing is implemented, a scan
    // finds nothing. It must never invent a desktop.
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) {
        setState(() {
          _isScanning = false;
          _scanFoundNothing = true;
          _statusNote = 'NO DESKTOP FOUND';
        });
        widget.state.addLog('Scan complete: no RemoteLink desktop found');
      }
    });
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
            final isConnecting = widget.state.status == ConnectionStatus.connecting ||
                widget.state.status == ConnectionStatus.waitingApproval;

            final form = _buildForm(context, c, isConnected, isConnecting);
            final statusCard = _buildStatusCard(context, c, isConnected, isConnecting);

            return LayoutBuilder(
              builder: (context, constraints) {
                if (constraints.maxWidth >= 720) {
                  // Landscape / wide: form beside the status card.
                  return SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 24.0),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 920),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: form)),
                            const SizedBox(width: 48),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 24),
                                child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 380), child: statusCard),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 48.0),
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

  Widget _buildForm(BuildContext context, AppColors c, bool isConnected, bool isConnecting) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const AppLogo(size: 80),
        const SizedBox(height: 24),
        Text('Remote Link', style: Theme.of(context).textTheme.headlineLarge),
        Text('Enterprise Remote Utility', style: Theme.of(context).textTheme.labelSmall),
        const SizedBox(height: 40),

        TextField(
                    controller: _ipController,
                    onChanged: widget.state.setHostIp,
                    decoration: const InputDecoration(
                      labelText: 'PC Host IP',
                      hintText: 'Enter PC Host IP',
                      helperText: 'Use the Recommended Host IP from the desktop app. If the phone cannot connect, try another detected LAN IP.',
                      helperMaxLines: 2,
                      prefixIcon: Icon(Icons.wifi, size: 20),
                    ),
                  ),
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
                          Text('Scanning local network...', style: TextStyle(fontSize: 12, color: c.textMuted)),
                        ],
                      )
                    else ...[
                      if (_scanFoundNothing) ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: c.card,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: c.border),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.search_off, size: 16, color: c.textMuted),
                              const SizedBox(width: 10),
                              Flexible(
                                child: Text('No RemoteLink desktop found',
                                    style: TextStyle(fontSize: 13, color: c.textSecondary)),
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
                            Flexible(child: Text('Scan for local devices', overflow: TextOverflow.ellipsis)),
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

  Widget _buildStatusCard(BuildContext context, AppColors c, bool isConnected, bool isConnecting) {
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
                    style: TextStyle(fontWeight: FontWeight.w600, color: c.textPrimary)),
              ),
              StatusPill(
                label: isConnected || isConnecting
                    ? _statusLabel(widget.state.status)
                    : (_statusNote ?? widget.state.status.name),
                color: isConnected
                    ? c.green
                    : isConnecting
                        ? c.amber
                        : _statusNote == 'NO DESKTOP FOUND' ||
                                widget.state.status == ConnectionStatus.denied ||
                                widget.state.status == ConnectionStatus.failed
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
}
