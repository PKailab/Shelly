// components/layout/SettingsDropdown.tsx
//
// Drop-down settings panel anchored to the gear button in AgentBar.
// Consolidates Display (CRT/Font), Language, AI Agents, and API Keys
// that were previously scattered across the top bar.

import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  PanResponder,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCosmeticStore } from '@/store/cosmetic-store';
import { useSettingsStore } from '@/store/settings-store';
import { useI18n } from '@/lib/i18n';
import { colors as C, fonts as F, sizes as S, radii as R } from '@/theme.config';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type FontSizePreset = { label: 'S' | 'M' | 'L'; size: number };
const FONT_SIZE_PRESETS: FontSizePreset[] = [
  { label: 'S', size: 12 },
  { label: 'M', size: 14 },
  { label: 'L', size: 16 },
];

export function SettingsDropdown({ visible, onClose }: Props) {
  if (!visible) return null;
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
        <View style={styles.header}>
          <MaterialIcons name="settings" size={13} color={C.text2} />
          <Text style={styles.headerTitle}>SETTINGS</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <MaterialIcons name="close" size={13} color={C.text2} />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <DisplaySection />
          <LanguageSection />
          <AgentsSection />
          <ApiKeysSection />
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

// ─── Display ─────────────────────────────────────────────────────────────────

function DisplaySection() {
  const crtEnabled = useCosmeticStore((s) => s.crtEnabled);
  const crtIntensity = useCosmeticStore((s) => s.crtIntensity);
  const setCrt = useCosmeticStore((s) => s.setCrt);
  const setCrtIntensity = useCosmeticStore((s) => s.setCrtIntensity);

  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const trackWidth = 140;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        setCrtIntensity(Math.round(Math.max(0, Math.min(100, (x / trackWidth) * 100))));
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        setCrtIntensity(Math.round(Math.max(0, Math.min(100, (x / trackWidth) * 100))));
      },
    })
  ).current;

  const fillWidth = (crtIntensity / 100) * trackWidth;

  return (
    <Section title="DISPLAY">
      {/* CRT Effect toggle */}
      <Row label="CRT Effect">
        <Pressable
          style={[styles.switchTrack, crtEnabled && styles.switchTrackOn]}
          onPress={() => setCrt(!crtEnabled)}
          hitSlop={4}
        >
          <View style={[styles.switchThumb, crtEnabled && styles.switchThumbOn]} />
        </Pressable>
      </Row>

      {/* Intensity slider (only when CRT enabled) */}
      {crtEnabled && (
        <Row label="Intensity">
          <View style={styles.sliderGroup}>
            <View style={styles.sliderTrackWrap} {...panResponder.panHandlers}>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: fillWidth }]} />
                <View style={[styles.sliderThumb, { left: fillWidth - 5 }]} />
              </View>
            </View>
            <Text style={styles.sliderPercent}>{crtIntensity}%</Text>
          </View>
        </Row>
      )}

      {/* Font size preset */}
      <Row label="Font Size">
        <View style={styles.segGroup}>
          {FONT_SIZE_PRESETS.map((p) => {
            const active = fontSize === p.size;
            return (
              <Pressable
                key={p.label}
                style={[styles.segBtn, active && styles.segBtnActive]}
                onPress={() => updateSettings({ fontSize: p.size })}
                hitSlop={4}
              >
                <Text style={[styles.segLabel, active && styles.segLabelActive]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Row>
    </Section>
  );
}

// ─── Language ────────────────────────────────────────────────────────────────

function LanguageSection() {
  const locale = useI18n((s) => s.locale);
  const setLocale = useI18n((s) => s.setLocale);

  return (
    <Section title="LANGUAGE">
      <View style={styles.langRow}>
        <Pressable
          style={styles.langOption}
          onPress={() => setLocale('en')}
          hitSlop={4}
        >
          <View style={[styles.radio, locale === 'en' && styles.radioOn]} />
          <Text style={[styles.langLabel, locale === 'en' && styles.langLabelActive]}>EN</Text>
        </Pressable>
        <Pressable
          style={styles.langOption}
          onPress={() => setLocale('ja')}
          hitSlop={4}
        >
          <View style={[styles.radio, locale === 'ja' && styles.radioOn]} />
          <Text style={[styles.langLabel, locale === 'ja' && styles.langLabelActive]}>JA</Text>
        </Pressable>
      </View>
    </Section>
  );
}

// ─── AI Agents ───────────────────────────────────────────────────────────────

function AgentsSection() {
  const defaultAgent = useSettingsStore((s) => s.settings.defaultAgent);
  const autoApproveLevel = useSettingsStore((s) => s.settings.autoApproveLevel);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const agentLabel = (() => {
    switch (defaultAgent) {
      case 'claude-code': return 'Claude';
      case 'gemini-cli': return 'Gemini';
      default: return String(defaultAgent ?? '—');
    }
  })();

  const toggleAutoApprove = () => {
    const next = autoApproveLevel === 'none' ? 'safe' : 'none';
    updateSettings({ autoApproveLevel: next as any });
  };

  const autoOn = autoApproveLevel !== 'none';

  return (
    <Section title="AI AGENTS">
      <Row label="Default">
        <Text style={styles.rowValue}>{agentLabel}</Text>
      </Row>
      <Row label="Auto-approve">
        <Pressable
          style={[styles.switchTrack, autoOn && styles.switchTrackOn]}
          onPress={toggleAutoApprove}
          hitSlop={4}
        >
          <View style={[styles.switchThumb, autoOn && styles.switchThumbOn]} />
        </Pressable>
      </Row>
    </Section>
  );
}

// ─── API Keys ────────────────────────────────────────────────────────────────

function ApiKeysSection() {
  const geminiApiKey = useSettingsStore((s) => s.settings.geminiApiKey);
  const perplexityApiKey = useSettingsStore((s) => s.settings.perplexityApiKey);
  const groqApiKey = useSettingsStore((s) => s.settings.groqApiKey);

  const rows: Array<{ label: string; set: boolean }> = [
    { label: 'Gemini', set: !!geminiApiKey },
    { label: 'Perplexity', set: !!perplexityApiKey },
    { label: 'Groq', set: !!groqApiKey },
  ];

  return (
    <Section title="API KEYS">
      {rows.map((r) => (
        <Row key={r.label} label={r.label}>
          {r.set ? (
            <View style={styles.statusOn}>
              <MaterialIcons name="check" size={10} color={C.accent} />
              <Text style={styles.statusOnText}>設定済</Text>
            </View>
          ) : (
            <Text style={styles.statusOff}>未設定</Text>
          )}
        </Row>
      ))}
      <Pressable
        style={styles.manageBtn}
        onPress={() => {
          useSettingsStore.getState().setShowConfigTUI(true);
        }}
      >
        <Text style={styles.manageBtnText}>MANAGE KEYS →</Text>
      </Pressable>
    </Section>
  );
}

// ─── Shared atoms ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const PANEL_WIDTH = 260;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 300,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  panel: {
    width: PANEL_WIDTH,
    maxHeight: '85%',
    marginTop: S.agentBarHeight + 4,
    marginRight: 8,
    backgroundColor: C.bgSurface,
    borderWidth: S.borderWidth,
    borderColor: C.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: S.borderWidth,
    borderBottomColor: C.border,
    backgroundColor: C.bgSidebar,
  },
  headerTitle: {
    color: C.text1,
    fontSize: F.contextBar.size,
    fontFamily: F.family,
    fontWeight: '700',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 2,
  },
  scroll: {
    flexGrow: 0,
  },
  // Section
  section: {
    borderBottomWidth: S.borderWidth,
    borderBottomColor: C.border,
    paddingVertical: 6,
  },
  sectionTitle: {
    color: C.text2,
    fontSize: F.badge.size,
    fontFamily: F.family,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sectionBody: {
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  rowLabel: {
    color: C.text1,
    fontSize: F.sidebarItem.size,
    fontFamily: F.family,
    fontWeight: F.sidebarItem.weight,
  },
  rowControl: {
    alignItems: 'flex-end',
  },
  rowValue: {
    color: C.text2,
    fontSize: F.sidebarItem.size,
    fontFamily: F.family,
  },
  // Switch
  switchTrack: {
    width: 28,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchTrackOn: {
    backgroundColor: 'rgba(0,212,170,0.35)',
  },
  switchThumb: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.text2,
  },
  switchThumbOn: {
    backgroundColor: C.accent,
    alignSelf: 'flex-end',
  },
  // Slider
  sliderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sliderTrackWrap: {
    width: 140,
    height: 20,
    justifyContent: 'center',
  },
  sliderTrack: {
    width: 140,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    position: 'relative',
  },
  sliderFill: {
    height: 4,
    backgroundColor: C.accent,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
  },
  sliderPercent: {
    color: C.text2,
    fontSize: F.badge.size,
    fontFamily: F.family,
    fontWeight: F.badge.weight,
    minWidth: 28,
    textAlign: 'right',
  },
  // Segmented (font size)
  segGroup: {
    flexDirection: 'row',
    gap: 2,
    borderWidth: S.borderWidth,
    borderColor: C.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  segBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'transparent',
  },
  segBtnActive: {
    backgroundColor: 'rgba(0,212,170,0.15)',
  },
  segLabel: {
    color: C.text2,
    fontSize: F.sidebarItem.size,
    fontFamily: F.family,
    fontWeight: '700',
  },
  segLabelActive: {
    color: C.accent,
  },
  // Language
  langRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radio: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.text2,
  },
  radioOn: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  langLabel: {
    color: C.text2,
    fontSize: F.sidebarItem.size,
    fontFamily: F.family,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  langLabelActive: {
    color: C.text1,
  },
  // API key status
  statusOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusOnText: {
    color: C.accent,
    fontSize: F.badge.size,
    fontFamily: F.family,
    fontWeight: F.badge.weight,
  },
  statusOff: {
    color: C.text3,
    fontSize: F.badge.size,
    fontFamily: F.family,
    fontWeight: F.badge.weight,
  },
  manageBtn: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  manageBtnText: {
    color: C.accent,
    fontSize: F.badge.size,
    fontFamily: F.family,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
