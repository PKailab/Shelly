// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mappings.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "terminal": "terminal",
  "magnifyingglass": "search",
  "gearshape.fill": "settings",
  "plus": "add",
  "xmark": "close",
  "doc.on.doc": "content-copy",
  "arrow.counterclockwise": "replay",
  "square.and.arrow.up": "share",
  "trash": "delete",
  "checkmark.circle.fill": "check-circle",
  "exclamationmark.triangle": "warning",
  "wifi": "wifi",
  "wifi.slash": "wifi-off",
  "desktopcomputer": "computer",
  "cloud": "cloud",
  "cloud.slash": "cloud-off",
} as unknown as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
