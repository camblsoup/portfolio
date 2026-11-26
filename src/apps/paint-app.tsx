import { createEffect, createSignal, onMount, Show } from "solid-js";
import { ColorPicker } from "../components/base/color-picker";
import { AppComponentProps } from "../kernel/app-registry/structure";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob>
{
  return new Promise((resolve, reject) =>
  {
    canvas.toBlob((blob) =>
    {
      if (blob)
      {
        resolve(blob);
      }
      else
      {
        reject(new Error("Canvas toBlob conversion failed"));
      }
    });
  });
}

export function PaintApp({ bridge }: AppComponentProps)
{
  const [filePath, setFilePath] = createSignal<string | undefined>(bridge.openedFile);
  const [loading, setLoading] = createSignal(false);
  const [canvasWidth, setCanvasWidth] = createSignal(300);
  const [canvasHeight, setCanvasHeight] = createSignal(150);
  let canvasRef: HTMLCanvasElement | undefined;
  let canvasCtx: CanvasRenderingContext2D | null = null;

  const configureCanvasContext = (
    options?: { lineCap?: CanvasLineCap; lineJoin?: CanvasLineJoin },
  ) =>
  {
    if (!canvasCtx)
    {
      return;
    }
    canvasCtx.lineCap = options?.lineCap ?? "round";
    canvasCtx.lineJoin = options?.lineJoin ?? "miter";
  };

  const [color, setColor] = createSignal("#000000");
  const [brushSize, setBrushSize] = createSignal(5);
  const [tool, setTool] = createSignal<"brush" | "eraser" | "fill" | "shape">("brush");
  const [shape, setShape] = createSignal<"rectangle" | "ellipse">("rectangle");
  const [filledShape, setFilledShape] = createSignal(false);
  const [isDrawing, setIsDrawing] = createSignal(false);

  const brushCursor = () =>
  {
    const size = brushSize();
    const cursorSize = Math.max(8, Math.ceil(size) + 2);
    const center = cursorSize / 2;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cursorSize}" height="${cursorSize}" viewBox="0 0 ${cursorSize} ${cursorSize}"><circle cx="${center}" cy="${center}" r="${
        size / 2
      }" fill="${color()}" stroke="#000000" stroke-width="1"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.floor(center)} ${
      Math.floor(center)
    }, crosshair`;
  };

  const toolCursor = () =>
  {
    if (tool() === "brush")
    {
      return brushCursor();
    }
    if (tool() === "shape")
    {
      return "crosshair";
    }

    const icon = tool() === "eraser" ? "eraser" : "fill";
    return `url("/paint-icons/${icon}.svg") 12 12, crosshair`;
  };
  let shapeStart: { x: number; y: number } | undefined;
  let shapeSnapshot: HTMLCanvasElement | undefined;

  onMount(() =>
  {
    if (!canvasRef)
    {
      return;
    }

    canvasCtx = canvasRef.getContext("2d");
    if (!canvasCtx)
    {
      console.error("Failed to get canvas context.");
      return;
    }

    const initialPath = bridge.openedFile;
    if (!initialPath)
    {
      configureCanvasContext();
      return;
    }

    setLoading(true);
    void (async () =>
    {
      try
      {
        const bytes = await bridge.fileSystem.readContent(initialPath);
        const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: "image/png" }));

        canvasRef.width = bitmap.width;
        canvasRef.height = bitmap.height;
        setCanvasWidth(bitmap.width);
        setCanvasHeight(bitmap.height);

        configureCanvasContext();
        canvasCtx.drawImage(bitmap, 0, 0);
      }
      catch (error)
      {
        console.error(`Unable to open '${initialPath}'.`, error);
      }
      finally
      {
        setLoading(false);
      }
    })();
  });
  const writeFile = async (path: string) =>
  {
    if (!canvasRef)
    {
      return;
    }
    const blob = await canvasToBlob(canvasRef);
    const imageArrayBuffer = await blob.bytes();
    await bridge.fileSystem.writeFile(
      path,
      imageArrayBuffer,
      "image/png",
    );
  };

  const save = async () =>
  {
    const currentPath = filePath();
    if (!currentPath)
    {
      return;
    }

    try
    {
      await writeFile(currentPath);
    }
    catch (error)
    {
      console.error(`Unable to save '${currentPath}'.`, error);
    }
  };

  const saveAs = async () =>
  {
    try
    {
      const selectedPath = await bridge.chooseSavePath("Untitled.png");
      if (!selectedPath)
      {
        return;
      }

      setFilePath(selectedPath);
      await writeFile(selectedPath);
    }
    catch (error)
    {
      console.error("Unable to save the image.", error);
    }
  };

  const newCanvas = () =>
  {
    setFilePath(undefined);
    canvasCtx?.reset();
    configureCanvasContext();
  };

  createEffect(() =>
  {
    const currentPath = filePath();
    const isLoading = loading();
    bridge.setMenus([{
      label: "File",
      items: [
        {
          label: "New",
          disabled: isLoading,
          onClick: newCanvas,
        },
        {
          label: "Save",
          disabled: !currentPath,
          onClick: () => void save(),
        },
        {
          label: "Save As…",
          disabled: isLoading,
          onClick: () => void saveAs(),
        },
      ],
    }]);
  });

  const getCoordinates = (e: PointerEvent) =>
  {
    const rect = canvasRef!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef!.height / rect.height),
    };
  };

  const drawShape = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  {
    if (!canvasCtx)
    {
      return;
    }

    canvasCtx.strokeStyle = color();
    canvasCtx.fillStyle = color();
    canvasCtx.lineWidth = brushSize();

    if (shape() === "rectangle")
    {
      const width = to.x - from.x;
      const height = to.y - from.y;
      if (filledShape())
      {
        canvasCtx.fillRect(from.x, from.y, width, height);
      }
      else
      {
        canvasCtx.strokeRect(from.x, from.y, width, height);
      }
      return;
    }

    canvasCtx.beginPath();
    canvasCtx.ellipse(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      Math.abs(to.x - from.x) / 2,
      Math.abs(to.y - from.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    if (filledShape())
    {
      canvasCtx.fill();
    }
    else
    {
      canvasCtx.stroke();
    }
  };

  const fillCanvasAt = (x: number, y: number) =>
  {
    if (!canvasRef || !canvasCtx)
    {
      return;
    }

    const width = canvasRef.width;
    const height = canvasRef.height;
    const startX = Math.floor(x);
    const startY = Math.floor(y);
    if (startX < 0 || startY < 0 || startX >= width || startY >= height)
    {
      return;
    }

    try
    {
      const image = canvasCtx.getImageData(0, 0, width, height);
      const pixels = image.data;
      const startOffset = (startY * width + startX) * 4;
      const target = [
        pixels[startOffset],
        pixels[startOffset + 1],
        pixels[startOffset + 2],
        pixels[startOffset + 3],
      ];
      const hex = color().slice(1);
      const replacement = [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
        255,
      ];

      if (target.every((channel, index) => channel === replacement[index]))
      {
        return;
      }

      const tolerance = 128;
      const matchesTarget = (pixelX: number, pixelY: number) =>
      {
        const offset = (pixelY * width + pixelX) * 4;
        if (
          pixels[offset] === replacement[0]
          && pixels[offset + 1] === replacement[1]
          && pixels[offset + 2] === replacement[2]
          && pixels[offset + 3] === replacement[3]
        )
        {
          return false;
        }

        return target.every((channel, index) =>
          Math.abs(pixels[offset + index] - channel) <= tolerance
        );
      };

      const pending = [startY * width + startX];
      while (pending.length > 0)
      {
        const seed = pending.pop()!;
        const seedX = seed % width;
        const seedY = Math.floor(seed / width);
        if (!matchesTarget(seedX, seedY))
        {
          continue;
        }
        let left = seedX;
        while (left >= 0 && matchesTarget(left, seedY))
        {
          left -= 1;
        }
        left += 1;

        let right = left;
        while (right < width && matchesTarget(right, seedY))
        {
          right += 1;
        }
        const end = right - 1;

        for (let fillX = left; fillX <= end; fillX += 1)
        {
          const offset = (seedY * width + fillX) * 4;
          pixels[offset] = replacement[0];
          pixels[offset + 1] = replacement[1];
          pixels[offset + 2] = replacement[2];
          pixels[offset + 3] = replacement[3];
        }

        const queueAdjacentRuns = (adjacentY: number) =>
        {
          let inRun = false;
          for (
            let adjacentX = Math.max(0, left - 1);
            adjacentX <= Math.min(width - 1, end + 1);
            adjacentX += 1
          )
          {
            const matches = matchesTarget(adjacentX, adjacentY);
            if (matches && !inRun)
            {
              pending.push(adjacentY * width + adjacentX);
            }
            inRun = matches;
          }
        };

        if (seedY > 0)
        {
          queueAdjacentRuns(seedY - 1);
        }
        if (seedY < height - 1)
        {
          queueAdjacentRuns(seedY + 1);
        }
      }

      canvasCtx.putImageData(image, 0, 0);
    }
    catch (error)
    {
      console.error("Unable to fill the canvas area.", error);
    }
  };

  const startDrawing = (e: PointerEvent) =>
  {
    if (!canvasCtx)
    {
      return;
    }
    const point = getCoordinates(e);
    const activeTool = tool();
    if (activeTool === "fill")
    {
      fillCanvasAt(point.x, point.y);
      return;
    }

    if (activeTool === "shape" && canvasRef)
    {
      shapeStart = point;
      shapeSnapshot = document.createElement("canvas");
      shapeSnapshot.width = canvasRef.width;
      shapeSnapshot.height = canvasRef.height;
      shapeSnapshot.getContext("2d")?.drawImage(canvasRef, 0, 0);
    }

    setIsDrawing(true);
    canvasCtx.globalCompositeOperation = activeTool === "eraser"
      ? "destination-out"
      : "source-over";
    canvasCtx.beginPath();
    if (activeTool === "brush" || activeTool === "eraser")
    {
      canvasCtx.fillStyle = color();
      canvasCtx.arc(point.x, point.y, brushSize() / 2, 0, Math.PI * 2);
      canvasCtx.fill();
      canvasCtx.beginPath();
    }
    canvasCtx.moveTo(point.x, point.y);
  };

  const draw = (e: PointerEvent) =>
  {
    if (!canvasCtx || !isDrawing())
    {
      return;
    }
    const point = getCoordinates(e);

    if (tool() === "shape" && shapeStart && shapeSnapshot)
    {
      canvasCtx.clearRect(0, 0, canvasRef!.width, canvasRef!.height);
      canvasCtx.drawImage(shapeSnapshot, 0, 0);
      drawShape(shapeStart, point);
      return;
    }

    configureCanvasContext(tool() === "shape" ? { lineJoin: "miter" } : { lineJoin: "round" });
    canvasCtx.globalCompositeOperation = tool() === "eraser" ? "destination-out" : "source-over";
    canvasCtx.strokeStyle = color();
    canvasCtx.lineWidth = brushSize();
    canvasCtx.lineTo(point.x, point.y);
    canvasCtx.stroke();
  };

  const stopDrawing = () =>
  {
    if (!canvasCtx || !isDrawing())
    {
      return;
    }
    setIsDrawing(false);
    canvasCtx.closePath();
    canvasCtx.globalCompositeOperation = "source-over";
    shapeStart = undefined;
    shapeSnapshot = undefined;
  };

  const resizeCanvas = (width: number, height: number) =>
  {
    if (!canvasRef || !canvasCtx)
    {
      return;
    }

    const nextWidth = Math.max(1, Math.min(8192, Math.round(width)));
    const nextHeight = Math.max(1, Math.min(8192, Math.round(height)));
    if (nextWidth === canvasRef.width && nextHeight === canvasRef.height)
    {
      return;
    }

    const preservedCanvas = document.createElement("canvas");
    preservedCanvas.width = canvasRef.width;
    preservedCanvas.height = canvasRef.height;
    preservedCanvas.getContext("2d")?.drawImage(canvasRef, 0, 0);

    canvasRef.width = nextWidth;
    canvasRef.height = nextHeight;
    canvasCtx = canvasRef.getContext("2d");
    if (!canvasCtx)
    {
      return;
    }

    configureCanvasContext();
    canvasCtx.drawImage(preservedCanvas, 0, 0);
    setCanvasWidth(nextWidth);
    setCanvasHeight(nextHeight);
  };

  let resizeStart: {
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
  } | undefined;

  const startResize = (e: PointerEvent) =>
  {
    if (!canvasRef || loading())
    {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.getBoundingClientRect();
    resizeStart = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      width: canvasRef.width,
      height: canvasRef.height,
      scaleX: rect.width / canvasRef.width || 1,
      scaleY: rect.height / canvasRef.height || 1,
    };
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
  };

  const dragResize = (e: PointerEvent) =>
  {
    if (!resizeStart)
    {
      return;
    }
    resizeCanvas(
      resizeStart.width + (e.clientX - resizeStart.pointerX) / resizeStart.scaleX,
      resizeStart.height + (e.clientY - resizeStart.pointerY) / resizeStart.scaleY,
    );
  };

  const stopResize = () =>
  {
    resizeStart = undefined;
  };

  return (
    <div class="paint-app">
      <div class="paint-toolbar" aria-label="Paint tools">
        <div class="paint-control">
          <span>Tool</span>
          <div class="paint-tool-buttons" role="group" aria-label="Paint tool">
            <button
              type="button"
              class="paint-tool-button"
              classList={{ "is-active": tool() === "brush" }}
              aria-label="Brush"
              aria-pressed={tool() === "brush"}
              title="Brush"
              onClick={() => setTool("brush")}
            >
              <img src="/paint-icons/brush.svg" alt="" />
            </button>
            <button
              type="button"
              class="paint-tool-button"
              classList={{ "is-active": tool() === "eraser" }}
              aria-label="Eraser"
              aria-pressed={tool() === "eraser"}
              title="Eraser"
              onClick={() => setTool("eraser")}
            >
              <img src="/paint-icons/eraser.svg" alt="" />
            </button>
            <button
              type="button"
              class="paint-tool-button"
              classList={{ "is-active": tool() === "fill" }}
              aria-label="Fill"
              aria-pressed={tool() === "fill"}
              title="Fill"
              onClick={() => setTool("fill")}
            >
              <img src="/paint-icons/fill.svg" alt="" />
            </button>
            <button
              type="button"
              class="paint-tool-button"
              classList={{ "is-active": tool() === "shape" }}
              aria-label="Shape"
              aria-pressed={tool() === "shape"}
              title="Shape"
              onClick={() => setTool("shape")}
            >
              <img src="/paint-icons/shapes.svg" alt="" />
            </button>
          </div>
        </div>
        <Show when={tool() === "shape"}>
          <label class="paint-control">
            <span>Shape</span>
            <select
              aria-label="Shape type"
              value={shape()}
              onChange={(e) => setShape(e.currentTarget.value as "rectangle" | "ellipse")}
            >
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </label>
          <label class="paint-control">
            <input
              type="checkbox"
              checked={filledShape()}
              onChange={(e) => setFilledShape(e.currentTarget.checked)}
            />
            <span>Filled</span>
          </label>
        </Show>
        <label class="paint-control">
          <span>Color</span>
          <ColorPicker value={color()} onChange={(v) => setColor(v)} />
        </label>
        <label class="paint-control paint-brush-control">
          <span>Brush width</span>
          <input
            aria-label="Brush width"
            type="range"
            min="1"
            max="100"
            step="1"
            value={brushSize()}
            onInput={(e) => setBrushSize(Number(e.currentTarget.value))}
          />
          <output>{brushSize()} px</output>
        </label>
        <output class="paint-canvas-size">{canvasWidth()} × {canvasHeight()} px</output>
      </div>
      <div class="paint-canvas-viewport">
        <div class="paint-canvas-frame">
          <canvas
            class="paint-canvas"
            data-tool={tool()}
            data-shape={tool() === "shape" ? shape() : undefined}
            style={{ cursor: toolCursor() }}
            aria-label="Paint app contents"
            aria-busy={loading()}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            onPointerCancel={stopDrawing}
            ref={canvasRef}
          />
          <button
            class="paint-resize-handle"
            type="button"
            aria-label="Resize canvas"
            title="Drag to resize canvas"
            disabled={loading()}
            onPointerDown={startResize}
            onPointerMove={dragResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
          />
        </div>
      </div>
    </div>
  );
}
