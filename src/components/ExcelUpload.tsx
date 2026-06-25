import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { makeCall } from "@/api/voicebot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, Play, Trash2, Plus, UserPlus, CalendarIcon, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import * as XLSX from "xlsx";


interface Template {
  id: string;
  template_id: string | null;
  org_name: string;
  message: string;
}

interface ContactRow {
  phone_number: string;
  due_date: string;
  amount: string;
}

const ExcelUpload = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [contactData, setContactData] = useState<ContactRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCall, setCurrentCall] = useState(0);

  const [manualEntry, setManualEntry] = useState<ContactRow>({
    phone_number: "",
    due_date: "",
    amount: "",
  });

  // call_templates is not served by the Go API; no templates are available here.
  const templates: Template[] = [];

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const parsedData: ContactRow[] = jsonData.map((row: Record<string, unknown>) => ({
          phone_number: String(row["Tel. Number"] || row["phone_number"] || row["Phone"] || row["เบอร์โทร"] || ""),
          due_date: String(row["Due Date"] || row["due_date"] || row["วันกำหนดชำระ"] || row["วันกำหนด"] || row["Appointment Date"] || ""),
          amount: String(row["Amount"] || row["amount"] || row["จำนวนค้างชำระ"] || row["จำนวน"] || row["ยอด"] || row["Appointment Time"] || ""),
        })).filter((row) => row.phone_number);

        setContactData((prev) => [...prev, ...parsedData]);
        toast.success(`Loaded ${parsedData.length} contacts`);
      } catch (error) {
        console.error("Error parsing Excel:", error);
        toast.error("Failed to parse file");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleAddManualEntry = () => {
    if (!manualEntry.phone_number) {
      toast.error("Please enter a phone number");
      return;
    }

    setContactData((prev) => [...prev, { ...manualEntry }]);
    setManualEntry({ phone_number: "", due_date: "", amount: "" });
    toast.success("Contact added");
  };

  const handleRemoveEntry = (index: number) => {
    setContactData((prev) => prev.filter((_, i) => i !== index));
  };

  const getPreviewMessage = () => {
    if (!selectedTemplate || !templates) return "";
    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) return "";
    
    return template.message
      .replace(/{Due Date}/g, "[Due Date]")
      .replace(/{Appointment Date}/g, "[Due Date]")
      .replace(/{Amount}/g, "[Amount]")
      .replace(/{Appointment Time}/g, "[Amount]");
  };

  const startCallsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate || contactData.length === 0) {
        throw new Error("Please select a template and add contacts");
      }

      const template = templates.find((t) => t.id === selectedTemplate);
      if (!template?.template_id) {
        throw new Error("Selected template has no Botnoi ID");
      }

      setIsProcessing(true);
      setProgress(0);
      setCurrentCall(0);

      // The Go API places calls via /voicebot/make-call. Call-record persistence is
      // not done here (this legacy campaign flow has no workspace context).
      const results = [];
      for (let i = 0; i < contactData.length; i++) {
        const row = contactData[i];
        setCurrentCall(i + 1);
        setProgress(((i + 1) / contactData.length) * 100);

        try {
          await makeCall({ phone_number: row.phone_number, variables: { ...row } });
          results.push({ success: true, phone: row.phone_number });
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error calling ${row.phone_number}:`, error);
          results.push({ success: false, phone: row.phone_number });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter((r) => r.success).length;
      toast.success(`Completed: ${successful}/${results.length} calls initiated`);
      setContactData([]);
      setIsProcessing(false);
      setProgress(0);
    },
    onError: (error) => {
      console.error("Error starting calls:", error);
      toast.error("Failed to start calls");
      setIsProcessing(false);
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Campaign</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload contacts and start automated calls
        </p>
      </div>

      {/* Template Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Select Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {templates?.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.org_name} ({template.template_id || "No ID"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplate && (
            <div className="p-3 rounded-md bg-muted text-sm">
              <span className="text-xs text-muted-foreground block mb-1">Preview:</span>
              {getPreviewMessage()}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Add Contacts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Add Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="manual" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual" className="gap-2 text-sm">
                  <UserPlus className="w-4 h-4" />
                  Manual
                </TabsTrigger>
                <TabsTrigger value="excel" className="gap-2 text-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Phone Number</Label>
                    <Input
                      value={manualEntry.phone_number}
                      onChange={(e) =>
                        setManualEntry((prev) => ({ ...prev, phone_number: e.target.value }))
                      }
                      placeholder="0812345678"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Due Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !manualEntry.due_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {manualEntry.due_date || "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-popover border" align="start">
                        <Calendar
                          mode="single"
                          selected={manualEntry.due_date ? new Date(manualEntry.due_date) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const formattedDate = format(date, "d MMMM yyyy", { locale: th });
                              setManualEntry((prev) => ({ ...prev, due_date: formattedDate }));
                            }
                          }}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Amount (฿)</Label>
                    <Input
                      value={manualEntry.amount}
                      onChange={(e) =>
                        setManualEntry((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      placeholder="5,000"
                    />
                  </div>
                  <Button onClick={handleAddManualEntry} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="excel" className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="excel-upload"
                  />
                  <label
                    htmlFor="excel-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Upload Excel file</p>
                      <p className="text-xs text-muted-foreground">
                        .xlsx, .xls, .csv
                      </p>
                    </div>
                  </label>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Expected columns:</p>
                  <ul className="space-y-0.5 text-xs">
                    <li>• Phone: Tel. Number, phone_number, เบอร์โทร</li>
                    <li>• Due Date: Due Date, วันกำหนดชำระ</li>
                    <li>• Amount: Amount, จำนวนค้างชำระ</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Contact List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Contact List
              </CardTitle>
              {contactData.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {contactData.length} contacts
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Processing {currentCall} of {contactData.length}
                  </span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => startCallsMutation.mutate()}
                disabled={!selectedTemplate || contactData.length === 0 || isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Start Calls
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setContactData([])}
                disabled={contactData.length === 0 || isProcessing}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {contactData.length > 0 ? (
              <div className="max-h-[280px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Phone</TableHead>
                      <TableHead className="text-xs">Due Date</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{row.phone_number}</TableCell>
                        <TableCell className="text-sm">{row.due_date || "-"}</TableCell>
                        <TableCell className="text-sm">{row.amount || "-"}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveEntry(i)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contacts added</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExcelUpload;
