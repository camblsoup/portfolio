import { ColorArea } from "@kobalte/core/color-area";
import { ColorField } from "@kobalte/core/color-field";
import { ColorSlider } from "@kobalte/core/color-slider";
import { type Color, parseColor } from "@kobalte/core/colors";
import { Dialog } from "@kobalte/core/dialog";
import { Popover } from "@kobalte/core/popover";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import "./color-picker.css";

export interface ColorPickerProps
{
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
}

function PickerControls(props: {
  color: Color;
  hexValue: string;
  onColorChange: (color: Color) => void;
  onHexChange: (value: string) => void;
  onHexBlur: () => void;
})
{
  return (
    <div class="color-picker-controls">
      <ColorArea
        class="color-picker-area"
        value={props.color}
        onChange={props.onColorChange}
        colorSpace="hsl"
        xChannel="saturation"
        yChannel="lightness"
        aria-label="Color saturation and lightness"
      >
        <ColorArea.Background class="color-picker-area-background">
          <ColorArea.Thumb class="color-picker-area-thumb" />
        </ColorArea.Background>
      </ColorArea>
      <div class="color-picker-hue">
        <span>Hue</span>
        <ColorSlider
          class="color-picker-hue-slider"
          value={props.color}
          onChange={props.onColorChange}
          colorSpace="hsl"
          channel="hue"
          aria-label="Hue"
        >
          <ColorSlider.Track class="color-picker-hue-track">
            <ColorSlider.Thumb class="color-picker-hue-thumb">
              <ColorSlider.Input />
            </ColorSlider.Thumb>
          </ColorSlider.Track>
        </ColorSlider>
      </div>
      <ColorField
        class="color-picker-hex"
        value={props.hexValue}
        onChange={props.onHexChange}
      >
        <ColorField.Label>Hex</ColorField.Label>
        <ColorField.Input aria-label="Hex color value" onBlur={props.onHexBlur} />
      </ColorField>
    </div>
  );
}

export function ColorPicker(props: ColorPickerProps)
{
  const [internalValue, setInternalValue] = createSignal(props.defaultValue ?? "#000000");
  const [hexDraft, setHexDraft] = createSignal(props.value ?? props.defaultValue ?? "#000000");
  const [isDesktop, setIsDesktop] = createSignal(false);

  const color = createMemo(() => parseColor(props.value ?? internalValue()));
  const label = () => props.label ?? "Choose color";

  createEffect(() =>
  {
    if (props.value !== undefined)
    {
      setHexDraft(parseColor(props.value).toString("hex"));
    }
  });

  const updateColor = (nextColor: Color) =>
  {
    const value = nextColor.toString("hex");
    setHexDraft(value);
    if (props.value === undefined)
    {
      setInternalValue(value);
    }
    props.onChange?.(value);
  };

  const updateHex = (value: string) =>
  {
    setHexDraft(value);
    if (/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
    {
      updateColor(parseColor(value));
    }
  };

  const finishHexEdit = () =>
  {
    try
    {
      updateColor(parseColor(hexDraft()));
    }
    catch
    {
      setHexDraft(color().toString("hex"));
    }
  };

  onMount(() =>
  {
    const media = window.matchMedia("(min-width: 681px) and (hover: hover) and (pointer: fine)");
    const updateDevice = () => setIsDesktop(media.matches);
    updateDevice();
    media.addEventListener("change", updateDevice);
    onCleanup(() => media.removeEventListener("change", updateDevice));
  });

  return (
    <>
      {isDesktop()
        ? (
          <Popover>
            <Popover.Trigger class="color-picker-trigger" aria-label={label()}>
              <span
                class="color-picker-swatch"
                style={{ "background-color": color().toString("css") }}
              />
              <span>{color().toString("hex")}</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content class="color-picker-popup" aria-label={label()}>
                <PickerControls
                  color={color()}
                  hexValue={hexDraft()}
                  onColorChange={updateColor}
                  onHexChange={updateHex}
                  onHexBlur={finishHexEdit}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover>
        )
        : (
          <Dialog>
            <Dialog.Trigger class="color-picker-trigger" aria-label={label()}>
              <span
                class="color-picker-swatch"
                style={{ "background-color": color().toString("css") }}
              />
              <span>{color().toString("hex")}</span>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay class="color-picker-overlay" />
              <Dialog.Content class="color-picker-dialog">
                <div class="color-picker-dialog-heading">
                  <Dialog.Title>{label()}</Dialog.Title>
                  <Dialog.CloseButton class="color-picker-close" aria-label="Close color picker">
                    ×
                  </Dialog.CloseButton>
                </div>
                <PickerControls
                  color={color()}
                  hexValue={hexDraft()}
                  onColorChange={updateColor}
                  onHexChange={updateHex}
                  onHexBlur={finishHexEdit}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>
        )}
    </>
  );
}
