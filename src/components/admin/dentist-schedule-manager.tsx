"use client";

import { ArrowLeft, CalendarClock, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
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
          <Button asChild variant="outline" size="default">
            <Link href="/admin/dentists">
              <ArrowLeft aria-hidden />
              Back to Dentists
            </Link>
          </Button>
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