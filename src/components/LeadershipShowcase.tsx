import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { positionLabel, positionRank } from '@/lib/leaderPositions';

type Leader = { id: string; church_id: string | null; position: string; name: string; details: string | null; photo_path: string | null };
type ChurchName = { id: string; name: string };

// The highlighted church box: the church name is always shown on two balanced lines, fully inside the box.
// The text shrinks (from 11px down to 6px) until the longer line fits the box width.
function ChurchBadge({ name }: { name: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState(11);

  // Split at the space that makes the two lines closest in length
  const parts = useMemo(() => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return [words.join(' ')];
    let best = 1;
    let bestGap = Infinity;
    for (let i = 1; i < words.length; i++) {
      const gap = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }, [name]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let current = 11;
      el.style.fontSize = `${current}px`;
      while (el.scrollWidth > el.clientWidth + 0.5 && current > 6) {
        current -= 0.25;
        el.style.fontSize = `${current}px`;
      }
      el.style.fontSize = '';
      setSize(current);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [parts]);

  return (
    <p
      ref={ref}
      className="w-full min-w-0 max-w-full rounded-lg bg-orange-100 px-1.5 py-1.5 text-center font-bold leading-[1.2] text-orange-800 ring-1 ring-orange-300"
      style={{ fontSize: `${size}px` }}
    >
      {parts.map((part, index) => <span key={index} className="block whitespace-nowrap">{part}</span>)}
    </p>
  );
}

// The leaders of every church: photo, name, position and church. The Super Admin manages the list ("Leaders Page").
//  variant "panel": a 3D carousel for the orange side of the sign-in page, right under the Fuego logo.
//  variant "light": the same carousel on a light background (phones and the sign-up pages).
// The card in the middle is large and sharp; the cards on both sides are tilted in 3D, smaller and blurred.
export function LeadershipShowcase({ variant = 'light' }: { variant?: 'panel' | 'light' }) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pausedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const rootRef = useRef<HTMLDivElement>(null);
  const [bleed, setBleed] = useState<{ margin: number; width: number } | null>(null);
  const marginRef = useRef(0);

  // Panel variant: stretch the carousel from the left edge to the right edge of the gradient panel,
  // however much padding the page puts around it. We find the nearest ancestor with the gradient background.
  useEffect(() => {
    const el = rootRef.current;
    if (variant !== 'panel' || !el) return;
    let panel: HTMLElement | null = el.parentElement;
    while (panel && !getComputedStyle(panel).backgroundImage.includes('gradient')) panel = panel.parentElement;
    if (!panel) return;
    const measure = () => {
      const rect = panel!.getBoundingClientRect();
      const naturalLeft = el.getBoundingClientRect().left - marginRef.current;
      const margin = rect.left - naturalLeft;
      marginRef.current = margin;
      setBleed((old) => (old && Math.abs(old.margin - margin) < 0.5 && Math.abs(old.width - rect.width) < 0.5 ? old : { margin, width: rect.width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [variant, leaders.length]);

  useEffect(() => {
    const load = async () => {
      const [{ data: leaderData }, { data: churchData }] = await Promise.all([
        supabase.from('public_leaders').select('id, church_id, position, name, details, photo_path'),
        supabase.from('churches').select('id, name').order('name'),
      ]);
      setLeaders((leaderData as Leader[]) || []);
      setChurches((churchData as ChurchName[]) || []);
    };
    load();
  }, []);

  const churchName = (id: string | null) => churches.find((church) => church.id === id)?.name || '';
  const photoUrl = (path: string | null) => (path ? supabase.storage.from('leadership-photos').getPublicUrl(path).data.publicUrl : '');

  // Group order: 1) Chairman, 2) PC members, 3) Pastorate members, 4) Local church members only.
  // Inside a group: church by church, then by the usual position order, then by name.
  const groupRank = (position: string) => {
    const text = `${position} ${positionLabel(position)}`.toLowerCase();
    if (text.includes('chairman')) return 0;
    if (/\bpc\b/.test(text) || text.includes('pastorate committee')) return 1;
    if (text.includes('pastorate')) return 2;
    return 3;
  };

  const sorted = useMemo(() => {
    const order = (id: string | null) => { const index = churches.findIndex((church) => church.id === id); return index === -1 ? churches.length : index; };
    // Among the local members, the Thandurai church comes first
    const thandurai = (leader: Leader) => (groupRank(leader.position) === 3 && churchName(leader.church_id).toLowerCase().includes('thandurai') ? 0 : 1);
    return leaders
      .filter((leader) => !filter || leader.church_id === filter)
      .sort((a, b) => groupRank(a.position) - groupRank(b.position) || thandurai(a) - thandurai(b) || order(a.church_id) - order(b.church_id) || positionRank(a.position) - positionRank(b.position) || a.name.localeCompare(b.name));
  }, [leaders, churches, filter]);

  const count = sorted.length;

  // 3D effect: the further a card is from the middle, the more it turns, shrinks, fades and blurs.
  const applyEffects = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    cardRefs.current.forEach((card) => {
      if (!card) return;
      const distance = (card.offsetLeft + card.offsetWidth / 2 - middle) / (card.offsetWidth + 16); // in cards
      // Cards far outside the view get no effects at all (keeps long lists smooth)
      if (Math.abs(distance) > 3) {
        if (card.dataset.far !== '1') {
          card.dataset.far = '1';
          card.style.transform = 'none';
          card.style.filter = 'none';
          card.style.opacity = '1';
        }
        return;
      }
      card.dataset.far = '0';
      const far = Math.min(Math.abs(distance), 2);
      const turn = Math.max(-1, Math.min(1, distance)) * -38;
      card.style.transform = `translateZ(${-far * 60}px) rotateY(${turn}deg) scale(${1 - far * 0.1})`;
      // Only the cards already passed (left side) are blurred; upcoming cards (right side) stay sharp
      const passed = distance < -0.15;
      card.style.filter = passed ? `blur(${Math.min(far, 1.5) * 2.5}px)` : 'none';
      card.style.opacity = passed ? String(Math.max(0.45, 1 - far * 0.25)) : '1';
      card.style.zIndex = String(10 - Math.round(far * 4));
    });
  }, []);

  const nearestIndex = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    const middle = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return best;
  };

  const goTo = (index: number) => {
    const el = scrollRef.current;
    const card = cardRefs.current[index];
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2, behavior: 'smooth' });
  };

  // Arrow buttons: pause the automatic movement for a few seconds while the person browses
  const nudge = (direction: 1 | -1) => {
    pausedRef.current = true;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { pausedRef.current = false; }, 5000);
    goTo(Math.max(0, Math.min(count - 1, nearestIndex() + direction)));
  };

  // Start on the first card and keep the effects up to date
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || count === 0) return;
    cardRefs.current.length = count; // forget cards that no longer exist (filter changed / list reloaded)
    el.scrollLeft = 0;
    applyEffects();
    let frame = 0;
    let settle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; applyEffects(); });
      // When scrolling stops, settle gently on the nearest card
      clearTimeout(settle);
      settle = setTimeout(() => goTo(nearestIndex()), 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', applyEffects);
    return () => {
      clearTimeout(settle);
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', applyEffects);
    };
  }, [count, filter, applyEffects]);

  // Automatically bring the next card to the middle every few seconds; after the last card go back to the first
  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const next = nearestIndex() + 1;
      goTo(next >= count ? 0 : next);
    }, 3200);
    return () => clearInterval(timer);
  }, [count, filter]);

  if (leaders.length === 0) return null;

  const dark = variant === 'panel';
  const pause = () => { clearTimeout(resumeTimer.current); pausedRef.current = true; };
  const resume = () => { clearTimeout(resumeTimer.current); resumeTimer.current = setTimeout(() => { pausedRef.current = false; }, 2000); };

  const arrowClass = `absolute top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-2xl font-bold leading-none shadow-xl ring-2 ${dark ? 'bg-white text-orange-600 ring-orange-200 hover:bg-orange-50' : 'bg-orange-500 text-white ring-white hover:bg-orange-600'}`;

  return (
    // contain: inline-size stops the long row of cards from stretching its parent, so the carousel is exactly as wide as the orange panel
    <div
      ref={rootRef}
      className={`${dark ? 'mt-8' : 'mt-5'} min-w-0 ${bleed ? '' : 'w-full max-w-full'}`}
      style={bleed ? { contain: 'inline-size', marginLeft: bleed.margin, width: bleed.width } : { contain: 'inline-size' }}
    >
      <div className="flex items-center justify-between gap-3" style={bleed ? { paddingInline: -bleed.margin } : undefined}>
        <p className={`whitespace-nowrap text-xs font-bold uppercase tracking-[0.18em] ${dark ? 'text-orange-100' : 'text-orange-600'}`}>Our leaders</p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`w-48 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none ${dark ? 'border border-white/30 bg-white/15 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
        >
          <option value="" className="text-gray-900">All churches</option>
          {churches.map((church) => <option key={church.id} value={church.id} className="text-gray-900">{church.name}</option>)}
        </select>
      </div>

      <div className="relative mt-2 w-full min-w-0 max-w-full">
        <button type="button" aria-label="Previous leader" onClick={() => nudge(-1)} className={`${arrowClass} left-0`}>‹</button>
        <button type="button" aria-label="Next leader" onClick={() => nudge(1)} className={`${arrowClass} right-0`}>›</button>

        <div
          ref={scrollRef}
          onMouseEnter={pause}
          onMouseLeave={resume}
          onTouchStart={pause}
          onTouchEnd={resume}
          onTouchCancel={resume}
          className="flex w-full min-w-0 max-w-full items-stretch gap-4 overflow-x-auto overflow-y-hidden py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ perspective: '900px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
        >
          {/* spacers let the first and last card reach the exact center */}
          <div aria-hidden className="shrink-0" style={{ width: 'calc(50% - 11rem)' }} />
          {sorted.map((leader, index) => (
            <div
              key={leader.id}
              ref={(node) => { cardRefs.current[index] = node; }}
              onClick={() => { pause(); goTo(index); resume(); }}
              className={`flex w-80 shrink-0 cursor-pointer flex-col items-center rounded-2xl border border-gray-200 bg-white p-4 text-center ${dark ? 'shadow-xl shadow-orange-900/30' : 'shadow-md'}`}
              style={{ transformStyle: 'preserve-3d', willChange: 'transform, filter' }}
            >
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-3xl font-extrabold text-orange-700 ring-2 ring-orange-200">
                {leader.photo_path ? <img src={photoUrl(leader.photo_path)} alt={leader.name} className="h-full w-full object-cover" /> : leader.name.charAt(0).toUpperCase()}
              </div>
              <p className="mt-3 min-h-[2.5rem] break-words text-sm font-bold leading-5 text-gray-900">{leader.name}</p>
              <p className="mt-1 min-h-[2.25rem] break-words text-xs font-semibold leading-[1.1rem] text-orange-600">{positionLabel(leader.position)}</p>
              <div className="mt-2 flex w-full min-w-0 flex-1 items-center justify-center">
                <ChurchBadge name={churchName(leader.church_id)} />
              </div>
            </div>
          ))}
          <div aria-hidden className="shrink-0" style={{ width: 'calc(50% - 11rem)' }} />
        </div>
      </div>
    </div>
  );
}