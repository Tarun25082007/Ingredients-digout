import React, { useEffect, useState } from 'react';
import { X, Download, Monitor, Zap, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const InstallAppModal = ({ isOpen, onClose, isInstallable, installApp }) => {
  const { t } = useLanguage();
  const [platform, setPlatform] = useState('desktop');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent.toLowerCase();
    if (/android/.test(ua)) {
      setPlatform('android');
    } else if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/macintosh|mac os x/.test(ua)) {
      setPlatform('mac');
    } else if (/windows/.test(ua)) {
      setPlatform('windows');
    } else {
      setPlatform('desktop');
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-custom-900 border border-custom-700 rounded-3xl shadow-2xl overflow-hidden p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-custom-800 hover:bg-custom-700 text-custom-300 hover:text-white transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-custom-500 p-0.5 shadow-lg flex items-center justify-center shrink-0">
            <img src="/pwa-192x192.png" alt="DigOut Logo" className="w-full h-full rounded-2xl object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">The Ingredient Digout</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                Desktop & Mobile
              </span>
            </div>
            <p className="text-xs text-custom-300 mt-0.5">
              Progressive Web App (PWA / TWA)
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-2 mb-5 text-center">
          <div className="p-2.5 rounded-xl bg-custom-800/80 border border-custom-700">
            <Zap className="w-4 h-4 mx-auto text-amber-400 mb-1" />
            <span className="text-[11px] font-semibold text-custom-200 block">Instant Launch</span>
          </div>
          <div className="p-2.5 rounded-xl bg-custom-800/80 border border-custom-700">
            <Monitor className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
            <span className="text-[11px] font-semibold text-custom-200 block">Standalone App</span>
          </div>
          <div className="p-2.5 rounded-xl bg-custom-800/80 border border-custom-700">
            <ShieldCheck className="w-4 h-4 mx-auto text-blue-400 mb-1" />
            <span className="text-[11px] font-semibold text-custom-200 block">Offline Cache</span>
          </div>
        </div>

        {/* 1-Click Native Install if supported */}
        {isInstallable && (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-950/70 border border-emerald-600/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-emerald-300">Native 1-Click Install Ready</p>
                <p className="text-xs text-emerald-200/80 mt-0.5">Install directly to your taskbar, desktop, or app drawer.</p>
              </div>
              <button
                onClick={async () => {
                  const success = await installApp();
                  if (success) onClose();
                }}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-sm transition shadow-lg active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Install Now</span>
              </button>
            </div>
          </div>
        )}

        {/* Instructions by Platform */}
        <div className="space-y-3 mb-6 bg-custom-800/60 border border-custom-700/80 rounded-2xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-custom-300">
            How to Install on {platform === 'windows' ? 'Windows (Desktop)' : platform === 'mac' ? 'macOS (Desktop)' : platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'Your Device'}:
          </p>

          {(platform === 'windows' || platform === 'desktop') && (
            <div className="space-y-2 text-xs text-custom-200">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                <span>Look at the right side of your browser address bar (URL bar) at the top.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                <span>Click the <strong>Install icon</strong> (<span className="text-emerald-400 font-bold">⊞</span> or <span className="text-emerald-400 font-bold">📥</span> "Install Digout").</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
                <span>Or open browser <strong>Menu (⋮ or ⋯) → "Save & Share" / "Apps" → "Install The Ingredient Digout"</strong>.</span>
              </div>
            </div>
          )}

          {platform === 'mac' && (
            <div className="space-y-2 text-xs text-custom-200">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                <span>In <strong>Safari</strong>, click <strong>File</strong> in the top menu bar, then select <strong>Add to Dock</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                <span>In <strong>Chrome / Edge</strong>, click the <strong>Install icon (⊞)</strong> in the address bar.</span>
              </div>
            </div>
          )}

          {platform === 'android' && (
            <div className="space-y-2 text-xs text-custom-200">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                <span>Tap the browser menu <strong>(⋮)</strong> in the top right corner.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                <span>Select <strong>"Install App"</strong> or <strong>"Add to Home screen"</strong>.</span>
              </div>
            </div>
          )}

          {platform === 'ios' && (
            <div className="space-y-2 text-xs text-custom-200">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                <span>Tap the <strong>Share</strong> button at the bottom of Safari (square with arrow).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-custom-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong>.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-custom-800 hover:bg-custom-700 text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallAppModal;
