import React from 'react';

interface LoaderProps {
  step: string;
}

const Loader: React.FC<LoaderProps> = ({ step }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 animate-pulse">
       <div className="relative w-24 h-24 mb-8">
         <div className="absolute inset-0 rounded-full border-t-2 border-[#ccff00] animate-spin" />
         <div className="absolute inset-2 rounded-full border-r-2 border-white/30 animate-spin duration-1000" style={{ animationDirection: 'reverse' }} />
         <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-[#ccff00] rounded-full shadow-[0_0_10px_#ccff00]" />
         </div>
       </div>
       <h3 className="text-xl font-mono text-[#ccff00] uppercase tracking-widest">{step}</h3>
       <p className="text-neutral-500 text-sm mt-2">
         {step === "Composing..." ? "Estimate: 30 seconds." : "Estimate: 1 minute."}
       </p>
    </div>
  );
};

export default Loader;