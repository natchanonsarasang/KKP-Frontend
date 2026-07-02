import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Filter, Sparkles, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

export interface FilterConditions {
  minDebt?: number;
  maxDebt?: number;
  minPickedUp?: number;
  maxPickedUp?: number;
  minNotPickedUp?: number;
  maxNotPickedUp?: number;
  minAccepted?: number;
  maxAccepted?: number;
  minRejected?: number;
  maxRejected?: number;
  status?: string;
  maxDebtors?: number; // Maximum debtors to queue (will randomly pick if filtered count exceeds this)
}

interface DebtorFilterPanelProps {
  onCalculateCount: (conditions: FilterConditions) => void;
  onConfirmSelection: (conditions: FilterConditions) => void;
  onClose: () => void;
  isLoading?: boolean;
  isConfirming?: boolean;
  matchCount?: number;
  totalAvailable?: number; // Total debtors not in queue
}

export function DebtorFilterPanel({ 
  onCalculateCount,
  onConfirmSelection,
  onClose, 
  isLoading,
  isConfirming,
  matchCount,
  totalAvailable 
}: DebtorFilterPanelProps) {
  const [activeTab, setActiveTab] = useState<string>("quick");
  const [filters, setFilters] = useState<FilterConditions>({});
  const [nlQuery, setNlQuery] = useState("");
  const isParsingQuery = false;
  const [maxDebtors, setMaxDebtors] = useState<number | undefined>(undefined);
  const [hasCalculated, setHasCalculated] = useState(false);

  const handleQuickFilterChange = (key: keyof FilterConditions, value: string) => {
    const numValue = value === "" ? undefined : Number(value);
    setFilters(prev => ({ ...prev, [key]: numValue }));
    setHasCalculated(false); // Reset when filters change
  };

  const handleCalculateCount = () => {
    setHasCalculated(true);
    onCalculateCount({ ...filters, maxDebtors });
  };

  const handleConfirmSelection = () => {
    onConfirmSelection({ ...filters, maxDebtors });
  };

  const handleNaturalLanguageQuery = async () => {
    if (!nlQuery.trim()) {
      toast.error("Please enter a query");
      return;
    }

    // Natural-language parsing (parse-debtor-query) is not available on the Go API.
    // Use the manual filter fields instead.
    toast.info("Natural-language filtering is not available — please use the manual filters");
  };

  const clearFilters = () => {
    setFilters({});
    setNlQuery("");
    setMaxDebtors(undefined);
    setHasCalculated(false);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter Debtors to Queue
          </CardTitle>
          {totalAvailable !== undefined && (
            <span className="text-sm text-muted-foreground">
              {totalAvailable.toLocaleString()} available
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="quick">
              <Filter className="w-4 h-4 mr-2" />
              Quick Filters
            </TabsTrigger>
            <TabsTrigger value="advanced">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Query
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Debt Amount</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1000"
                  value={filters.minDebt ?? ""}
                  onChange={(e) => handleQuickFilterChange("minDebt", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Debt Amount</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={filters.maxDebt ?? ""}
                  onChange={(e) => handleQuickFilterChange("maxDebt", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Picked Up</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={filters.minPickedUp ?? ""}
                  onChange={(e) => handleQuickFilterChange("minPickedUp", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Picked Up</Label>
                <Input
                  type="number"
                  placeholder="e.g. 3"
                  value={filters.maxPickedUp ?? ""}
                  onChange={(e) => handleQuickFilterChange("maxPickedUp", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Not Picked Up</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={filters.minNotPickedUp ?? ""}
                  onChange={(e) => handleQuickFilterChange("minNotPickedUp", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Not Picked Up</Label>
                <Input
                  type="number"
                  placeholder="e.g. 3"
                  value={filters.maxNotPickedUp ?? ""}
                  onChange={(e) => handleQuickFilterChange("maxNotPickedUp", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Accepted</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={filters.minAccepted ?? ""}
                  onChange={(e) => handleQuickFilterChange("minAccepted", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Accepted</Label>
                <Input
                  type="number"
                  placeholder="e.g. 2"
                  value={filters.maxAccepted ?? ""}
                  onChange={(e) => handleQuickFilterChange("maxAccepted", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Rejected</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={filters.minRejected ?? ""}
                  onChange={(e) => handleQuickFilterChange("minRejected", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Rejected</Label>
                <Input
                  type="number"
                  placeholder="e.g. 2"
                  value={filters.maxRejected ?? ""}
                  onChange={(e) => handleQuickFilterChange("maxRejected", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={filters.status ?? "all"} 
                onValueChange={(value) => setFilters(prev => ({ 
                  ...prev, 
                  status: value === "all" ? undefined : value 
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="hanged_up">Hang-up</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              className="w-full" 
              onClick={handleCalculateCount}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Filter className="w-4 h-4 mr-2" />
              )}
              Calculate Matches
            </Button>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <div className="space-y-2">
              <Label>Describe who you want to call</Label>
              <Textarea
                placeholder="e.g. Debtors with debt above 5000 who have never picked up the phone and haven't been rejected yet"
                value={nlQuery}
                onChange={(e) => {
                  setNlQuery(e.target.value);
                  setHasCalculated(false);
                }}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Use natural language to describe your filter criteria. The AI will convert it to filters.
              </p>
            </div>

            <Button 
              className="w-full" 
              onClick={handleNaturalLanguageQuery}
              disabled={isParsingQuery || !nlQuery.trim()}
            >
              {isParsingQuery ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Parse & Apply
            </Button>

            {Object.keys(filters).length > 0 && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">Parsed conditions:</p>
                <ul className="space-y-1 text-muted-foreground">
                  {filters.minDebt !== undefined && <li>• Debt ≥ {filters.minDebt.toLocaleString()}</li>}
                  {filters.maxDebt !== undefined && <li>• Debt ≤ {filters.maxDebt.toLocaleString()}</li>}
                  {filters.minPickedUp !== undefined && <li>• Picked up ≥ {filters.minPickedUp}</li>}
                  {filters.maxPickedUp !== undefined && <li>• Picked up ≤ {filters.maxPickedUp}</li>}
                  {filters.minNotPickedUp !== undefined && <li>• Not picked up ≥ {filters.minNotPickedUp}</li>}
                  {filters.maxNotPickedUp !== undefined && <li>• Not picked up ≤ {filters.maxNotPickedUp}</li>}
                  {filters.minAccepted !== undefined && <li>• Accepted ≥ {filters.minAccepted}</li>}
                  {filters.maxAccepted !== undefined && <li>• Accepted ≤ {filters.maxAccepted}</li>}
                  {filters.minRejected !== undefined && <li>• Rejected ≥ {filters.minRejected}</li>}
                  {filters.maxRejected !== undefined && <li>• Rejected ≤ {filters.maxRejected}</li>}
                  {filters.status && <li>• Status: {filters.status}</li>}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {hasCalculated && matchCount !== undefined && (
          <div className="mt-4 space-y-3">
            <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <span className="font-medium">{matchCount.toLocaleString()} debtors match your criteria</span>
            </div>
            
            {matchCount > 0 && (
              <>
                {/* Max Debtors Limit - shown after calculating matches */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <Label className="font-medium">Maximum Debtors to Queue</Label>
                  <Input
                    type="number"
                    placeholder={`Leave empty to add all ${matchCount.toLocaleString()} debtors`}
                    value={maxDebtors ?? ""}
                    onChange={(e) => setMaxDebtors(e.target.value === "" ? undefined : Number(e.target.value))}
                    min={1}
                    max={matchCount}
                  />
                  {maxDebtors !== undefined && matchCount > maxDebtors && (
                    <p className="text-xs text-muted-foreground">
                      Will randomly select {maxDebtors.toLocaleString()} from {matchCount.toLocaleString()} matching debtors
                    </p>
                  )}
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleConfirmSelection}
                  disabled={isConfirming}
                >
                  {isConfirming ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Users className="w-4 h-4 mr-2" />
                  )}
                  Confirm & Add {maxDebtors && matchCount > maxDebtors ? maxDebtors.toLocaleString() : matchCount.toLocaleString()} to Queue
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={clearFilters} className="flex-1">
            Clear
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
