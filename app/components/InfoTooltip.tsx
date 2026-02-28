"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface InfoTooltipProps {
    /** Optional heading shown in bold at the top of the tooltip */
    title?: string;
    /** Tooltip body content */
    children: ReactNode;
    /** Pixel width of the tooltip bubble (default: 220) */
    width?: number;
}

export default function InfoTooltip({ title, children, width = 220 }: InfoTooltipProps) {
    const [open, setOpen] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>({});
    const btnRef = useRef<HTMLButtonElement>(null);

    const calcStyle = useCallback(() => {
        if (!btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        const safeLeft = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        // prefer opening above; fall back to below if near the top
        if (r.top > 150) {
            setStyle({
                position: "fixed",
                bottom: window.innerHeight - r.top + 6,
                left: safeLeft,
                width,
                zIndex: 9999,
            });
        } else {
            setStyle({
                position: "fixed",
                top: r.bottom + 6,
                left: safeLeft,
                width,
                zIndex: 9999,
            });
        }
    }, [width]);

    const open_ = useCallback(() => { calcStyle(); setOpen(true); }, [calcStyle]);
    const close_ = useCallback(() => setOpen(false), []);
    const toggle = useCallback(() => { if (open) close_(); else open_(); }, [open, open_, close_]);

    // Close on any scroll or window resize
    useEffect(() => {
        if (!open) return;
        window.addEventListener("scroll", close_, true);
        window.addEventListener("resize", close_);
        return () => {
            window.removeEventListener("scroll", close_, true);
            window.removeEventListener("resize", close_);
        };
    }, [open, close_]);

    const tooltip = (
        <div
            style={style}
            onMouseEnter={open_}
            onMouseLeave={close_}
            className="rounded-lg bg-gray-900 border border-white/15 shadow-2xl p-2.5 text-[9px] text-white/70 leading-relaxed pointer-events-auto"
        >
            {title && <p className="font-semibold text-white/90 mb-1.5">{title}</p>}
            {children}
        </div>
    );

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={toggle}
                onMouseEnter={open_}
                onMouseLeave={close_}
                className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] text-white/40 hover:text-white/70 hover:bg-white/10 transition select-none shrink-0"
                aria-label={title ?? "More info"}
            >
                ⓘ
            </button>
            {open && typeof document !== "undefined" && createPortal(tooltip, document.body)}
        </>
    );
}
