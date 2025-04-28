import { ColorSwatch, Group } from '@mantine/core';
import { Button } from '@/components/ui/button';
import '../../index.css';
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { SWATCHES } from '@/constants';
import { Sun, Moon, Undo2, Redo2, Eraser, Pencil, Paintbrush, PaintBucket } from 'lucide-react';

interface GeneratedResult {
    expression: string;
    answer: string;
}

interface Response {
    expr: string;
    result: string;
    assign: boolean;
}

type Tool = 'pencil' | 'brush' | 'eraser' | 'fill';

export default function Home() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#ffffff');
    const [reset, setReset] = useState(false);
    const [dictOfVars, setDictOfVars] = useState<Record<string, number>>({});
    const [result, setResult] = useState<GeneratedResult>();
    const [latexExpression, setLatexExpression] = useState<string[]>([]);
    const [tool, setTool] = useState<Tool>('pencil');
    const [lineWidth, setLineWidth] = useState(3);
    const [undoStack, setUndoStack] = useState<ImageData[]>([]);
    const [redoStack, setRedoStack] = useState<ImageData[]>([]);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [showResult, setShowResult] = useState(false);

    // Theme toggle effect
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    useEffect(() => {
        if (latexExpression.length > 0 && window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise();
        }
    }, [latexExpression, lineWidth]);

    useEffect(() => {
        if (reset) {
            resetCanvas();
            setLatexExpression([]);
            setResult(undefined);
            setDictOfVars({});
            setReset(false);
            setUndoStack([]);
            setRedoStack([]);
        }
    }, [reset]);

    // --- Canvas Sizing and Pixel Ratio Fix with ResizeObserver ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const parent = canvas.parentElement;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            // Only resize if size actually changed
            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                // Save current image
                const ctx = canvas.getContext('2d');
                let image: ImageData | null = null;
                if (ctx) {
                    image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                }
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                canvas.style.width = rect.width + 'px';
                canvas.style.height = rect.height + 'px';
                if (ctx) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.scale(dpr, dpr);
                    ctx.lineCap = 'round';
                    ctx.lineWidth = lineWidth;
                    // Restore image
                    if (image) ctx.putImageData(image, 0, 0);
                }
            }
        };
        resize();
        window.addEventListener('resize', resize);
        let observer: ResizeObserver | undefined;
        if (window.ResizeObserver) {
            observer = new ResizeObserver(resize);
            observer.observe(canvas.parentElement!);
        }
        return () => {
            window.removeEventListener('resize', resize);
            if (observer) observer.disconnect();
        };
    }, [lineWidth]); // Add lineWidth to dependencies

    // Only update lineWidth, do not resize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineCap = 'round';
                ctx.lineWidth = lineWidth;
            }
        }
    }, [lineWidth]);

    // Save canvas state for undo
    const saveState = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                setUndoStack((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
                setRedoStack([]); // Clear redo stack on new action
            }
        }
    }, []);

    // Undo/Redo handlers
    const handleUndo = () => {
        const canvas = canvasRef.current;
        if (canvas && undoStack.length > 0) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const last = undoStack[undoStack.length - 1];
                setRedoStack((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
                ctx.putImageData(last, 0, 0);
                setUndoStack((prev) => prev.slice(0, -1));
            }
        }
    };

    const handleRedo = () => {
        const canvas = canvasRef.current;
        if (canvas && redoStack.length > 0) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const last = redoStack[redoStack.length - 1];
                setUndoStack((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
                ctx.putImageData(last, 0, 0);
                setRedoStack((prev) => prev.slice(0, -1));
            }
        }
    };

    const renderLatexToCanvas = useCallback(
        (expression: string, answer: string) => {
            const latex = `\\(\\LARGE{${expression} = ${answer}}\\)`;
            setLatexExpression((prev) => [...prev, latex]);
        },
        []
    );

    useEffect(() => {
        if (result) {
            renderLatexToCanvas(result.expression, result.answer);
        }
    }, [result, renderLatexToCanvas]);

    const resetCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    // Fill bucket tool (simple flood fill)
    const fillBucket = (x: number, y: number, fillColor: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const hexToRgba = (hex: string) => {
            let c = hex.substring(1);
            if (c.length === 3) c = c.split('').map((x) => x + x).join('');
            const num = parseInt(c, 16);
            return [
                (num >> 16) & 255,
                (num >> 8) & 255,
                num & 255,
                255
            ];
        };

        const targetColor = [
            data[(y * width + x) * 4],
            data[(y * width + x) * 4 + 1],
            data[(y * width + x) * 4 + 2],
            data[(y * width + x) * 4 + 3]
        ];
        const replacementColor = hexToRgba(fillColor);

        const matchColor = (a: number[], b: number[]) =>
            a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

        if (matchColor(targetColor, replacementColor)) return;

        const stack = [[x, y]];
        while (stack.length) {
            const [cx, cy] = stack.pop()!;
            const idx = (cy * width + cx) * 4;
            const currentColor = [
                data[idx],
                data[idx + 1],
                data[idx + 2],
                data[idx + 3]
            ];
            if (matchColor(currentColor, targetColor)) {
                data[idx] = replacementColor[0];
                data[idx + 1] = replacementColor[1];
                data[idx + 2] = replacementColor[2];
                data[idx + 3] = replacementColor[3];
                if (cx > 0) stack.push([cx - 1, cy]);
                if (cx < width - 1) stack.push([cx + 1, cy]);
                if (cy > 0) stack.push([cx, cy - 1]);
                if (cy < height - 1) stack.push([cx, cy + 1]);
            }
        }
        ctx.putImageData(imageData, 0, 0);
    };

    // --- Drawing Logic with Correct Coordinates ---
    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left),
            y: (e.clientY - rect.top)
        };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        saveState();
        if (tool === 'fill') {
            const { x, y } = getCanvasCoords(e);
            fillBucket(Math.floor(x), Math.floor(y), color);
            setIsDrawing(false);
            return;
        }
        const { x, y } = getCanvasCoords(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (tool === 'eraser') {
            ctx.strokeStyle = theme === 'dark' ? '#222' : '#fff';
        } else {
            ctx.strokeStyle = color;
        }
        ctx.lineWidth = tool === 'brush' ? lineWidth * 2 : lineWidth;
        const { x, y } = getCanvasCoords(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    // --- Blank Canvas Check ---
    function isCanvasBlank(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return true;
        const pixelBuffer = new Uint32Array(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
        );
        return !pixelBuffer.some(color => color !== 0);
    }

    const runRoute = async (): Promise<void> => {
        const canvas = canvasRef.current;
        if (canvas) {
            // Check if canvas is blank before sending
            if (isCanvasBlank(canvas)) {
                alert('Canvas is blank. Please draw something before running.');
                return;
            }
            try {
                const response = await axios.post<{ data: Response[] }>(
                    `${import.meta.env.VITE_API_URL}/calculate`,
                    {
                        image: canvas.toDataURL('image/png'),
                        dict_of_vars: dictOfVars,
                    }
                );
                const resp = response.data;
                resp.data.forEach((data: Response) => {
                    if (data.assign === true) {
                        setDictOfVars((prev) => ({
                            ...prev,
                            [data.expr]: parseFloat(data.result),
                        }));
                    }
                });

                const ctx = canvas.getContext('2d');
                const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
                let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        const i = (y * canvas.width + x) * 4;
                        if (imageData.data[i + 3] > 0) {
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        }
                    }
                }

                // Show result window after getting result
                setShowResult(true);

                resp.data.forEach((data: Response) => {
                    setTimeout(() => {
                        setResult({
                            expression: data.expr,
                            answer: data.result,
                        });
                    }, 1000);
                });
            } catch {
                alert('Failed to process the image. Please try again.');
            }
        }
    };

    return (
        <div className="relative min-h-screen bg-background text-foreground transition-colors">
            <div className="fixed top-0 left-0 w-full flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-card shadow rounded-lg z-50">
                <div className="flex gap-2">
                    <Button onClick={() => setReset(true)} className="bg-destructive text-destructive-foreground" variant="destructive">
                        Reset
                    </Button>
                    <Button onClick={handleUndo} disabled={undoStack.length === 0} variant="outline" className="flex items-center gap-1">
                        <Undo2 size={18} /> Undo
                    </Button>
                    <Button onClick={handleRedo} disabled={redoStack.length === 0} variant="outline" className="flex items-center gap-1">
                        <Redo2 size={18} /> Redo
                    </Button>
                </div>
                <div className="flex gap-2 items-center">
                    <Button onClick={() => setTool('pencil')} variant={tool === 'pencil' ? 'secondary' : 'outline'} className="p-2" title="Pencil">
                        <Pencil size={18} />
                    </Button>
                    <Button onClick={() => setTool('brush')} variant={tool === 'brush' ? 'secondary' : 'outline'} className="p-2" title="Brush">
                        <Paintbrush size={18} />
                    </Button>
                    <Button onClick={() => setTool('eraser')} variant={tool === 'eraser' ? 'secondary' : 'outline'} className="p-2" title="Eraser">
                        <Eraser size={18} />
                    </Button>
                    <Button onClick={() => setTool('fill')} variant={tool === 'fill' ? 'secondary' : 'outline'} className="p-2" title="Fill Bucket">
                        <PaintBucket size={18} />
                    </Button>
                    <input
                        type="range"
                        min={1}
                        max={30}
                        value={lineWidth}
                        onChange={e => setLineWidth(Number(e.target.value))}
                        className="mx-2 accent-primary"
                        title="Line Size"
                    />
                    <span className="text-xs text-muted-foreground">Size: {lineWidth}px</span>
                </div>
                <Group className="z-20">
                    {SWATCHES.map((swatch) => (
                        <ColorSwatch
                            key={swatch}
                            color={swatch}
                            onClick={() => setColor(swatch)}
                            style={{
                                border: color === swatch ? '2px solid #333' : undefined,
                                cursor: 'pointer'
                            }}
                        />
                    ))}
                </Group>
                <Button onClick={runRoute} className="bg-primary text-primary-foreground" variant="default">
                    Run
                </Button>
                <Button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    variant="outline"
                    className="ml-2"
                    title="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </Button>
            </div>
            <div className="flex w-full h-full pt-24" style={{height: 'calc(100vh - 6rem)'}}>
                {/* Canvas Area */}
                <div className="flex-1 relative">
                    <canvas
                        ref={canvasRef}
                        id="canvas"
                        className="absolute top-0 left-0 w-full h-full z-10"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseOut={stopDrawing}
                        style={{ cursor: tool === 'eraser' ? 'cell' : tool === 'fill' ? 'crosshair' : 'crosshair' }}
                    />
                </div>
            </div>
            {/* Floating Result Modal */}
            {showResult && (
                <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40">
                    <div className="bg-card rounded-lg shadow-2xl p-8 min-w-[320px] max-w-lg relative border-2 border-primary animate-fade-in">
                        <button
                            className="absolute top-2 right-2 text-2xl font-bold text-gray-400 hover:text-primary transition-colors"
                            onClick={() => setShowResult(false)}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <h2 className="text-xl font-bold mb-4 text-primary">Result</h2>
                        {result ? (
                            <div className="mb-4 p-3 text-white rounded shadow bg-black/80 w-full text-lg">
                                <div className="text-white" style={{ whiteSpace: 'pre-line' }}>
                                    {result.expression} = {result.answer}
                                </div>
                            </div>
                        ) : (
                            <div className="text-muted-foreground">No result yet.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
