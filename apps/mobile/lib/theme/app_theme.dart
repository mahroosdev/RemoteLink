import 'package:flutter/material.dart';

/// Theme-scoped palette. Widgets read these via `context.colors` so the whole
/// app recolors when the ThemeData (and its embedded AppColors) is swapped.
class AppColors extends ThemeExtension<AppColors> {
  final Color background;
  final Color sidebar;
  final Color card;
  final Color elevatedCard;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;

  /// Surface used for the PC screen preview. Kept dark in every theme — a
  /// powered-off monitor is dark even in a light UI.
  final Color previewSurface;

  /// Touchpad surface/border/hint. Dark in dark themes; a softer professional
  /// dark gray in Light so it reads as a touch surface without being harsh.
  final Color touchpadSurface;
  final Color touchpadBorder;
  final Color touchpadHint;

  final Color green;
  final Color amber;
  final Color red;
  final Color blue;

  const AppColors({
    required this.background,
    required this.sidebar,
    required this.card,
    required this.elevatedCard,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.previewSurface,
    required this.touchpadSurface,
    required this.touchpadBorder,
    required this.touchpadHint,
    required this.green,
    required this.amber,
    required this.red,
    required this.blue,
  });

  @override
  AppColors copyWith({
    Color? background,
    Color? sidebar,
    Color? card,
    Color? elevatedCard,
    Color? border,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? previewSurface,
    Color? touchpadSurface,
    Color? touchpadBorder,
    Color? touchpadHint,
    Color? green,
    Color? amber,
    Color? red,
    Color? blue,
  }) {
    return AppColors(
      background: background ?? this.background,
      sidebar: sidebar ?? this.sidebar,
      card: card ?? this.card,
      elevatedCard: elevatedCard ?? this.elevatedCard,
      border: border ?? this.border,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      previewSurface: previewSurface ?? this.previewSurface,
      touchpadSurface: touchpadSurface ?? this.touchpadSurface,
      touchpadBorder: touchpadBorder ?? this.touchpadBorder,
      touchpadHint: touchpadHint ?? this.touchpadHint,
      green: green ?? this.green,
      amber: amber ?? this.amber,
      red: red ?? this.red,
      blue: blue ?? this.blue,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      background: Color.lerp(background, other.background, t)!,
      sidebar: Color.lerp(sidebar, other.sidebar, t)!,
      card: Color.lerp(card, other.card, t)!,
      elevatedCard: Color.lerp(elevatedCard, other.elevatedCard, t)!,
      border: Color.lerp(border, other.border, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      previewSurface: Color.lerp(previewSurface, other.previewSurface, t)!,
      touchpadSurface: Color.lerp(touchpadSurface, other.touchpadSurface, t)!,
      touchpadBorder: Color.lerp(touchpadBorder, other.touchpadBorder, t)!,
      touchpadHint: Color.lerp(touchpadHint, other.touchpadHint, t)!,
      green: Color.lerp(green, other.green, t)!,
      amber: Color.lerp(amber, other.amber, t)!,
      red: Color.lerp(red, other.red, t)!,
      blue: Color.lerp(blue, other.blue, t)!,
    );
  }
}

extension AppColorsContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
}

class AppTheme {
  static const String professionalDarkMode = 'Professional Dark';
  static const String pureBlackMode = 'Pure Black';
  static const String lightMode = 'Light';

  static const List<String> themeModes = [professionalDarkMode, pureBlackMode, lightMode];

  static const Color _green = Color(0xFF22C55E);
  static const Color _amber = Color(0xFFFACC15);
  static const Color _red = Color(0xFFEF4444);
  static const Color _blue = Color(0xFF3B82F6);

  static const AppColors professionalDarkColors = AppColors(
    background: Color(0xFF0B0C0F),
    sidebar: Color(0xFF08090B),
    card: Color(0xFF14161A),
    elevatedCard: Color(0xFF181B20),
    border: Color(0xFF2A2D34),
    textPrimary: Color(0xFFF5F5F5),
    textSecondary: Color(0xFFB6BAC3),
    textMuted: Color(0xFF858B96),
    previewSurface: Color(0xFF000000),
    touchpadSurface: Color(0xFF1F2329),
    touchpadBorder: Color(0xFF343943),
    touchpadHint: Color(0xFF7A828D),
    green: _green,
    amber: _amber,
    red: _red,
    blue: _blue,
  );

  static const AppColors pureBlackColors = AppColors(
    background: Color(0xFF000000),
    sidebar: Color(0xFF000000),
    card: Color(0xFF0F0F0F),
    elevatedCard: Color(0xFF111111),
    border: Color(0xFF2A2A2A),
    textPrimary: Color(0xFFFFFFFF),
    textSecondary: Color(0xFFB4B4B4),
    textMuted: Color(0xFF8A8A8A),
    previewSurface: Color(0xFF050505),
    touchpadSurface: Color(0xFF161616),
    touchpadBorder: Color(0xFF303030),
    touchpadHint: Color(0xFF5E5E5E),
    green: _green,
    amber: _amber,
    red: _red,
    blue: _blue,
  );

  static const AppColors lightColors = AppColors(
    background: Color(0xFFF7F7F8),
    sidebar: Color(0xFFFFFFFF),
    card: Color(0xFFFFFFFF),
    elevatedCard: Color(0xFFF1F2F4),
    border: Color(0xFFD7D7DB),
    textPrimary: Color(0xFF111111),
    textSecondary: Color(0xFF555555),
    textMuted: Color(0xFF8A8F98),
    previewSurface: Color(0xFF15171C),
    touchpadSurface: Color(0xFF34383F),
    touchpadBorder: Color(0xFF555B64),
    touchpadHint: Color(0xFFD1D5DB),
    green: Color(0xFF16A34A),
    amber: Color(0xFFD97706),
    red: _red,
    blue: Color(0xFF2563EB),
  );

  static ThemeData professionalDark() => _build(professionalDarkColors, Brightness.dark);
  static ThemeData pureBlack() => _build(pureBlackColors, Brightness.dark);
  static ThemeData light() => _build(lightColors, Brightness.light);

  static ThemeData themeFor(String mode) {
    switch (mode) {
      case pureBlackMode:
        return pureBlack();
      case lightMode:
        return light();
      case professionalDarkMode:
      default:
        return professionalDark();
    }
  }

  static ThemeData _build(AppColors c, Brightness brightness) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: c.blue,
      brightness: brightness,
    ).copyWith(
      primary: c.blue,
      surface: c.card,
      onSurface: c.textPrimary,
      error: c.red,
      outline: c.border,
    );

    return ThemeData(
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      cardColor: c.card,
      dividerColor: c.border,
      textTheme: TextTheme(
        headlineLarge: TextStyle(color: c.textPrimary, fontSize: 24, fontWeight: FontWeight.w600),
        headlineMedium: TextStyle(color: c.textPrimary, fontSize: 20, fontWeight: FontWeight.w500),
        titleLarge: TextStyle(color: c.textPrimary, fontSize: 18, fontWeight: FontWeight.w500),
        bodyLarge: TextStyle(color: c.textPrimary, fontSize: 15, fontWeight: FontWeight.w400),
        bodyMedium: TextStyle(color: c.textSecondary, fontSize: 14, fontWeight: FontWeight.w400),
        labelSmall: TextStyle(color: c.textMuted, fontSize: 12, fontWeight: FontWeight.w400),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.sidebar,
        foregroundColor: c.textPrimary,
        elevation: 0,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: c.sidebar,
        selectedItemColor: c.textPrimary,
        unselectedItemColor: c.textMuted,
        type: BottomNavigationBarType.fixed,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: c.sidebar,
        indicatorColor: c.blue.withValues(alpha: 0.15),
        selectedIconTheme: IconThemeData(color: c.blue, size: 22),
        unselectedIconTheme: IconThemeData(color: c.textMuted, size: 22),
        selectedLabelTextStyle: TextStyle(color: c.textPrimary, fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelTextStyle: TextStyle(color: c.textMuted, fontSize: 11),
      ),
      inputDecorationTheme: InputDecorationTheme(
        fillColor: c.card,
        filled: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.blue)),
        labelStyle: TextStyle(color: c.textMuted),
        hintStyle: TextStyle(color: c.textMuted),
      ),
      extensions: [c],
    );
  }
}
