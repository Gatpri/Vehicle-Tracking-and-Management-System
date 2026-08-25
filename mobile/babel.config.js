/**
 * Babel configuration.
 *
 * This file is not optional here. Reanimated 4 compiles its worklets through
 * react-native-worklets/plugin, and without that transform every worklet
 * silently falls back to running on the JS thread with its animated values
 * frozen at their initial state.
 *
 * The visible symptom is not "animations look wrong" — it is that touches stop
 * working. The drawer renders a full-screen overlay whose pointerEvents is
 * driven by useAnimatedProps: 'none' when closed, 'auto' when open. With the
 * plugin missing that prop never updates, so the invisible overlay keeps
 * swallowing every tap it covers — the tab bar, the chat Send button, the
 * drawer's own sign-out row.
 *
 * The plugin has to be last in the list; it rewrites code the other plugins
 * may still transform.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
