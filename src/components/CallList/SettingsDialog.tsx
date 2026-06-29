import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Volume2, Zap } from "lucide-react";
import { DAY_NAMES, DEFAULT_SETTINGS } from "./constants";
import type { AutoDialSettings } from "./types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AutoDialSettings;
  onSettingsChange: (updater: (prev: AutoDialSettings) => AutoDialSettings) => void;
  todayCallCount: number;
}

export function SettingsDialog({ open, onOpenChange, settings, onSettingsChange, todayCallCount }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto w-[calc(100%-2rem)] max-w-lg max-h-[85vh] p-0 flex flex-col gap-0 sm:rounded-lg">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Auto-Dial Settings</DialogTitle>
          <DialogDescription>Configure retry logic, limits, and business hours</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Test Mode Toggle */}
          <div className="rounded-lg border-2 border-dashed border-warning/50 bg-warning/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning" />
                  Test Mode
                </Label>
                <p className="text-xs text-muted-foreground">Simulate calls without hitting real phone numbers</p>
              </div>
              <Switch
                checked={settings.testMode}
                onCheckedChange={(checked) => onSettingsChange((s) => ({ ...s, testMode: checked }))}
              />
            </div>
            {settings.testMode && (
              <p className="text-xs text-warning font-medium">
                🧪 Test mode enabled - calls will be simulated with random outcomes
              </p>
            )}
          </div>

          {/* Interruptible Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                Interruptible
              </Label>
              <p className="text-xs text-muted-foreground">Allow the bot to be interrupted by the user speaking</p>
            </div>
            <Switch
              checked={settings.interruptible}
              onCheckedChange={(checked) => onSettingsChange((s) => ({ ...s, interruptible: checked }))}
            />
          </div>

          {/* Max Retries */}
          <div className="space-y-2">
            <Label>Max Retries per Contact</Label>
            <Input
              type="number"
              min={0}
              max={5}
              value={settings.maxRetries}
              onChange={(e) => onSettingsChange((s) => ({ ...s, maxRetries: parseInt(e.target.value) || 0 }))}
            />
            <p className="text-xs text-muted-foreground">
              How many times to retry failed/no-answer calls (0 = no retry)
            </p>
          </div>

          {/* Daily Limit */}
          <div className="space-y-2">
            <Label>Daily Call Limit</Label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={settings.dailyLimit}
              onChange={(e) => onSettingsChange((s) => ({ ...s, dailyLimit: parseInt(e.target.value) || 100 }))}
            />
            <p className="text-xs text-muted-foreground">Maximum calls per day ({todayCallCount || 0} made today)</p>
          </div>

          {/* Delay Between Calls */}
          <div className="space-y-2">
            <Label>Delay Between Calls (seconds)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={settings.delayBetweenCalls === 0 ? "" : settings.delayBetweenCalls}
              onChange={(e) => {
                const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                onSettingsChange((s) => ({ ...s, delayBetweenCalls: isNaN(val) ? 0 : val }));
              }}
              onBlur={(e) => {
                const val = parseInt(e.target.value);
                if (isNaN(val) || val < 1) {
                  onSettingsChange((s) => ({ ...s, delayBetweenCalls: 3 }));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Wait time between each batch of calls</p>
          </div>

          {/* Concurrent Calls */}
          <div className="space-y-2">
            <Label>Calls Per Batch</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.concurrentCalls === 0 ? "" : settings.concurrentCalls}
              onChange={(e) => {
                const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                onSettingsChange((s) => ({ ...s, concurrentCalls: isNaN(val) ? 0 : val }));
              }}
              onBlur={(e) => {
                const val = parseInt(e.target.value);
                if (isNaN(val) || val < 1) {
                  onSettingsChange((s) => ({ ...s, concurrentCalls: 5 }));
                } else if (val > 10) {
                  onSettingsChange((s) => ({ ...s, concurrentCalls: 10 }));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Number of calls to make simultaneously</p>
          </div>

          {/* Business Hours */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Business Hours Only</Label>
                <p className="text-xs text-muted-foreground">Only allow calls during set hours</p>
              </div>
              <Switch
                checked={settings.businessHoursOnly}
                onCheckedChange={(checked) => onSettingsChange((s) => ({ ...s, businessHoursOnly: checked }))}
              />
            </div>

            {settings.businessHoursOnly && (
              <div className="space-y-4">
                {/* Day Selection */}
                <div className="space-y-2">
                  <Label className="text-xs">Business Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_NAMES.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          onSettingsChange((s) => ({
                            ...s,
                            businessDays: s.businessDays.includes(index)
                              ? s.businessDays.filter((d) => d !== index)
                              : [...s.businessDays, index].sort(),
                          }));
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          settings.businessDays.includes(index)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Time</Label>
                    <Input
                      type="time"
                      value={settings.businessHoursStart}
                      onChange={(e) => onSettingsChange((s) => ({ ...s, businessHoursStart: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Time</Label>
                    <Input
                      type="time"
                      value={settings.businessHoursEnd}
                      onChange={(e) => onSettingsChange((s) => ({ ...s, businessHoursEnd: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t shrink-0 bg-background">
          <Button variant="outline" className="flex-1" onClick={() => onSettingsChange(() => DEFAULT_SETTINGS)}>
            Reset to Default
          </Button>
          <Button className="flex-1" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
