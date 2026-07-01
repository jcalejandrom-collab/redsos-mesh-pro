import React from 'react';
// @ts-ignore
import logoImg from '../assets/images/redsos_logo_1782922520653.jpg';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  animate?: boolean;
}

export default function Logo({ size = 'md', showText = true, animate = true }: LogoProps) {
  // Dimensions based on size prop
  const dimensions = {
    sm: { container: 'w-12 h-12 rounded-lg', textTitle: 'text-sm', textSub: 'text-[8px]' },
    md: { container: 'w-28 h-28 rounded-xl', textTitle: 'text-xl', textSub: 'text-[10px]' },
    lg: { container: 'w-56 h-56 rounded-2xl', textTitle: 'text-3xl', textSub: 'text-xs' },
    xl: { container: 'w-72 h-72 rounded-3xl', textTitle: 'text-4xl', textSub: 'text-sm' },
  };

  const dim = dimensions[size];

  return (
    <div className="flex flex-col items-center justify-center text-center">
      {/* Visual Image Core - High-Resolution RedSOS Mesh Logo */}
      <div className={`relative ${dim.container} select-none overflow-hidden border border-red-500/20 shadow-[0_0_25px_rgba(239,68,68,0.25)] bg-black`}>
        <img
          src={logoImg}
          alt="RedSOS Mesh Logo"
          className={`w-full h-full object-contain ${animate ? 'hover:scale-105 transition-transform duration-500' : ''}`}
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Typography block matching the uploaded brand specs */}
      {showText && (
        <div className="mt-4 flex flex-col items-center">
          <div className="flex items-center gap-1 font-display">
            <span className={`font-black tracking-wide ${dim.textTitle} text-white uppercase`}>
              Red
            </span>
            <span className={`font-black tracking-wide ${dim.textTitle} text-[#ef4444] uppercase`}>
              SOS
            </span>
          </div>
          <div className="text-slate-200 font-mono tracking-[0.45em] text-[10px] uppercase font-bold mt-1 pl-[0.45em]">
            MESH
          </div>
          <div className="text-[7px] md:text-[8px] text-slate-400 font-sans tracking-[0.25em] font-medium mt-2 border-t border-slate-800/80 pt-2 px-4 uppercase">
            Conectados. Protegidos. Siempre.
          </div>
        </div>
      )}
    </div>
  );
}

