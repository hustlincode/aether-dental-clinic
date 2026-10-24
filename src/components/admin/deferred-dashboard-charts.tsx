"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { DailyPoint, StatusSlice } from "./dashboard-charts";
import { DashboardChartsLoading } from "./dashboard-charts-loading";

const Charts = dynamic(() => import("./dashboard-charts").then((module) => module.DashboardCharts), {
  loading: DashboardChartsLoading,
});

export function DeferredDashboardCharts({ daily, status }: { daily: DailyPoint[]; status: StatusSlice[] }) {
  const region = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!region.current) return;
    if (!("IntersectionObserver" in window)) {
      const timer = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(region.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={region}>{visible ? <Charts daily={daily} status={status} /> : <DashboardChartsLoading />}</div>;
}
