import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import styles from '../style/index.module.css'

export interface SliderProps {
  /** Minimum value. Default: 0 */
  min?: number;
  /** Maximum value. Default: 100 */
  max?: number;
  /** Step increment. Default: 1 */
  step?: number;
  /** Uncontrolled initial value. Ignored if `value` is provided. Default: min */
  defaultValue?: number;
  /** Controlled value. If provided, component becomes controlled. */
  value?: number;
  /** Disable interaction */
  disabled?: boolean;
  /** Fired continuously while dragging / on every value change */
  onChange?: (value: number) => void;
  /** Fired once when a drag/interaction finishes (mouseup/touchend/keyup) */
  onChangeCommitted?: (value: number) => void;
  /** Optional aria-label for accessibility */
  ariaLabel?: string;
  /** Optional extra className appended to the root element */
  className?: string;
  /** Optional id passed to the root element */
  id?: string;
}

const clamp = (val: number, min: number, max: number) =>
  Math.min(max, Math.max(min, val));

const roundToStep = (val: number, min: number, step: number) => {
  const steps = Math.round((val - min) / step);
  return min + steps * step;
};

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  value,
  disabled = false,
  onChange,
  onChangeCommitted,
  ariaLabel = "Slider",
  className,
  id,
}) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<number>(
    clamp(defaultValue ?? min, min, max)
  );
  const MARGIN_PERCENT = 1.2;   // .fill margin
  const SCRUBBER_RIGHT_OFFSET = 3;   // .scrubber right
  const currentValue = isControlled ? (value as number) : internalValue;

  const trackRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [isActive, setIsActive] = useState(false);

  const percent = ((currentValue - min) / (max - min)) * 100;
  const fillWidthPercent = isActive
    ? percent
    : (percent / 100) * (100 - MARGIN_PERCENT * 2);

  const commitValue = useCallback(
    (raw: number, fireCommitted: boolean) => {
      const stepped = roundToStep(raw, min, step);
      const clamped = clamp(stepped, min, max);

      if (!isControlled) {
        setInternalValue(clamped);
      }
      onChange?.(clamped);
      if (fireCommitted) {
        onChangeCommitted?.(clamped);
      }
    },
    [isControlled, min, max, step, onChange, onChangeCommitted]
  );

  const valueFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return currentValue;

      const rect = track.getBoundingClientRect();
      const marginPx = (MARGIN_PERCENT / 100) * rect.width;
      const knobRadius =
        (scrubberRef.current?.getBoundingClientRect().width ?? 0) / 2;

      // Pixel range the knob's CENTER can actually occupy
      const usableWidth = rect.width - marginPx * 2;
      const centerOffset = marginPx - SCRUBBER_RIGHT_OFFSET - knobRadius;

      const x = clientX - rect.left;
      const ratio = clamp((x - centerOffset) / usableWidth, 0, 1);

      return min + ratio * (max - min);
    },
    [currentValue, min, max]
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    draggingRef.current = true;
    setIsActive(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    commitValue(valueFromPointer(e.clientX), false);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    commitValue(valueFromPointer(e.clientX), false);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsActive(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    commitValue(currentValue, true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = currentValue + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = currentValue - step;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      case "PageUp":
        next = currentValue + step * 10;
        break;
      case "PageDown":
        next = currentValue - step * 10;
        break;
      default:
        return;
    }

    e.preventDefault();
    commitValue(next, true);
  };

  // Safety net: if pointer is released outside the element, stop dragging.
  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        setIsActive(false);
        commitValue(currentValue, true);
      }
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue]);

  return (
    <div
      id={id}
      ref={trackRef}
      className={[
        styles['slider-maintrack'],
        isActive ? styles.active : styles.idle,
        disabled ? styles.disabled : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={currentValue}
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      <span className={styles['slider-value-text']}>{currentValue}</span>
      <div className={styles['slider-fill']} style={{ width: `${fillWidthPercent}%` }}>
        <div ref={scrubberRef} className={styles['slider-scrubber']} />
      </div>
    </div>
  );
};

export default Slider;
