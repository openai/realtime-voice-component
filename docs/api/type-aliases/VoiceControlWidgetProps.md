[**realtime-voice-component**](../README.md)

***

# Type Alias: VoiceControlWidgetProps

```ts
type VoiceControlWidgetProps = {
  className?: string;
  controller: VoiceControlController;
  controllerRef?: {
     current: VoiceControlController | null;
  };
  draggable?: boolean;
  labels?: Partial<VoiceControlWidgetLabels>;
  layout?: VoiceControlWidgetLayout;
  mobileBreakpoint?: number;
  mobileLayout?: VoiceControlWidgetLayout;
  partClassNames?: VoiceControlWidgetPartClassNames;
  persistPosition?: boolean;
  snapDefaultCorner?: VoiceControlWidgetCorner;
  snapInset?: number;
  snapToCorners?: boolean;
  unstyled?: boolean;
  widgetId?: string;
}
```
