"use client";

import { ArrowLeft, CalendarClock, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { BlockedDatesPanel } from "@/components/admin/blocked-dates-panel";
import { DentistScheduleEditor } from "@/components/admin/dentist-schedule-editor";

/**
 * Admin schedule management page for a single dentist.
 * Hosts the tabbed Weekly Schedule and Blocked Dates modules.
 */
export function DentistScheduleManager({
  dentistId,
  dentistName,
}: {
  dentistId: string;
  dentistName: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
      <PageHeader
        eyebrow="Dentists"
        title={`Schedule · ${dentistName}`}
        description="Control this dentist's weekly availability and one-off blocked dates. Changes apply to booking immediately."
        actions={
          <Link
            href="/admin/dentists"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <ArrowLeft size={16} />
            Back to Dentists
          </Link>
        }
      />

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="schedule">
            <CalendarClock size={16} />
            Weekly Schedule
          </TabsTrigger>
          <TabsTrigger value="blocked">
            <CalendarRange size={16} />
            Blocked Dates
          </TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-5">
          <DentistScheduleEditor dentistId={dentistId} />
        </TabsContent>
        <TabsContent value="blocked" className="mt-5">
          <BlockedDatesPanel dentistId={dentistId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}