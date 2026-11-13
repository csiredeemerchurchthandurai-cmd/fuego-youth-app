import { useState } from 'react';

export type WheelItem = { id: string; label: string; tag?: string };

// Each name gets one of these colours, on the wheel and in the name list beside it
export const WHEEL_COLORS = ['#f97316', '#0ea5e9', '#10b981', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#6366f1'];
const COLORS = WHEEL_COLORS;

// Random number from the browser's secure generator
function randomIndex(count: number) {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % count;
}

// Angles are measured clockwise from the top, where the pointer is.
function point(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: 150 + radius * Math.sin(radians), y: 150 - radius * Math.cos(radians) };
}

// A wheel of names. Each press of "Spin" picks one name at random; spinning is unlimited.
export function SpinWheel({ items, title, onResult }: { items: WheelItem[]; title: string; onResult: (item: WheelItem) => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const count = items.length;
  const segment = count > 0 ? 360 / count : 360;

  const spin = () => {
    if (spinning || count === 0) return;
    const winner = randomIndex(count);
    // Land somewhere inside the winning slice, not always dead centre
    const target = (winner + 0.5) * segment + (Math.random() - 0.5) * segment * 0.7;
    const current = rotation % 360;
    const extra = (((360 - target - current) % 360) + 360) % 360;
    setSpinning(true);
    setRotation(rotation + 360 * 6 + extra);
    window.setTimeout(() => { setSpinning(false); onResult(items[winner]); }, 4200);
  };

  const fontSize = count <= 10 ? 14 : count <= 16 ? 11 : 9;
  const showLabels = count <= 24;

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="relative h-64 w-64 sm:h-72 sm:w-72">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
          <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-slate-900" />
        </div>
        <div
          className="h-full w-full"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none' }}
        >
          <svg viewBox="0 0 300 300" className="h-full w-full">
            {count === 0 && <circle cx="150" cy="150" r="140" fill="#e5e7eb" />}
            {count === 1 && <circle cx="150" cy="150" r="140" fill={COLORS[0]} />}
            {count > 1 && items.map((item, index) => {
              const start = index * segment;
              const end = (index + 1) * segment;
              const a = point(start, 140);
              const b = point(end, 140);
              const path = `M150 150 L${a.x} ${a.y} A140 140 0 ${segment > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`;
              const middle = start + segment / 2;
              return (
                <g key={item.id}>
                  <path d={path} fill={COLORS[index % COLORS.length]} stroke="#fff" strokeWidth="1.5" />
                  {showLabels && (
                    <text x="282" y="154" textAnchor="end" fontSize={fontSize} fontWeight="700" fill="#fff" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" paintOrder="stroke" transform={`rotate(${middle - 90} 150 150)`}>
                      {item.label.length > 13 ? `${item.label.slice(0, 12)}…` : item.label}
                    </text>
                  )}
                </g>
              );
            })}
            <circle cx="150" cy="150" r="22" fill="#fff" stroke="#e5e7eb" strokeWidth="2" />
          </svg>
        </div>
      </div>
      <button onClick={spin} disabled={spinning || count === 0} className="mt-5 rounded-xl bg-orange-500 px-8 py-3 text-sm font-bold text-white shadow hover:bg-orange-600 disabled:opacity-40">
        {spinning ? 'Spinning...' : count === 0 ? 'No one to pick' : 'Spin'}
      </button>
    </div>
  );
}