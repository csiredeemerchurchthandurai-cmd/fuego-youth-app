export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-20 w-20' };
  const textSize = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' };

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${dims[size]} rounded-xl overflow-hidden bg-black flex items-center justify-center shadow-lg shadow-orange-500/20`}>
        <img src="/assets/images/Glossy_FUEGO_Phoenix_Emblem.png" alt="Fuego phoenix emblem" className="h-full w-full object-cover" />
      </div>
      <div className="leading-tight">
        <div className={`${textSize[size]} font-extrabold text-gray-900 tracking-tight`}>FUEGO</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-orange-600 font-semibold">Youth Fellowship</div>
      </div>
    </div>
  );
}
