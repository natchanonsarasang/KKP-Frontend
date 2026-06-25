import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { makeCall } from "@/api/voicebot";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Loader2, MessageSquare, CheckCircle, XCircle, HelpCircle, Trash2, Eye, Info, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface Template {
  id: string;
  template_id: string | null;
  message: string;
  confirm_message: string;
  decline_message: string;
  fallback_message: string;
  org_name: string;
  speaker_id: string;
  created_at: string;
  is_system_default: boolean;
  user_id: string | null;
  workspace_id: string | null;
}

const TemplateSetup = () => {
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTestCallDialog, setShowTestCallDialog] = useState(false);
  const [testCallPhone, setTestCallPhone] = useState("");
  const [testCallTemplateId, setTestCallTemplateId] = useState<string>("");
  
  const [formData, setFormData] = useState({
    message:
      "สวัสดีค่ะ จากบอทน้อยนะคะ คุณมียอดค้างชำระจำนวน {Amount} บาท กำหนดชำระภายในวันที่ {Due Date} ต้องการยืนยันการชำระเงินมั้ยคะ",
    confirm_message: "ขอบคุณค่ะ คุณได้ยืนยันการชำระเงินเรียบร้อยแล้วค่ะ",
    decline_message: "ขอบคุณค่ะ หากคุณต้องการสอบถามเพิ่มเติม สามารถติดต่อกลับหาเราได้เลยนะคะ ขอบคุณค่ะ",
    fallback_message: "ขอบคุณค่ะ หากคุณต้องการสอบถามเพิ่มเติม สามารถแจ้งเราได้เลยนะคะ",
    org_name: "บอทน้อย",
    speaker_id: "523",
  });

  // Fetch available variables from current workspace's debtors
  const { data: workspaceVariables = [] } = useQuery({
    queryKey: ["workspace-variables", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];

      const debtors = await listDebtorsByWorkspace(currentWorkspace.id);

      // Extract all unique variable keys (excluding message_template)
      const allKeys = new Set<string>();
      debtors.slice(0, 100).forEach((d) => {
        const vars = d.variables;
        if (vars) {
          Object.keys(vars).forEach((key) => {
            if (key !== "message_template") {
              allKeys.add(key);
            }
          });
        }
      });

      return Array.from(allKeys).sort();
    },
    enabled: !!currentWorkspace?.id,
  });

  // call_templates is not served by the Go API; no templates are persisted for now.
  const templates: Template[] = [];
  const isLoading = false;

  const createTemplateMutation = useMutation({
    // Template persistence is not part of the Go API yet (call_templates stubbed to null).
    mutationFn: async (_data: typeof formData) => {
      if (!effectiveUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
    },
    onSuccess: () => {
      toast.info("Template saving is not available — no template API is configured yet");
      setShowCreateForm(false);
    },
    onError: (error) => {
      console.error("Error creating template:", error);
      toast.error("Failed to create template");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (_templateId: string) => {
      // No-op: templates are not persisted via the Go API yet.
    },
    onSuccess: () => {
      toast.info("Template deletion is not available yet");
    },
    onError: (error) => {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTemplateMutation.mutate(formData);
  };

  const handleTemplateClick = (template: Template) => {
    setSelectedTemplate(template);
    setShowTemplateDialog(true);
  };

  const handleUseTemplate = () => {
    if (selectedTemplate) {
      setFormData({
        message: selectedTemplate.message,
        confirm_message: selectedTemplate.confirm_message,
        decline_message: selectedTemplate.decline_message,
        fallback_message: selectedTemplate.fallback_message,
        org_name: selectedTemplate.org_name,
        speaker_id: selectedTemplate.speaker_id,
      });
      setShowTemplateDialog(false);
      setShowCreateForm(true);
      toast.success("Template loaded");
    }
  };

  const insertPlaceholder = (field: string, placeholder: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field as keyof typeof prev] + ` {${placeholder}}`,
    }));
  };

  const messageFields = [
    { key: "message", label: "Main Message", icon: MessageSquare, description: "Initial message when call starts" },
    { key: "confirm_message", label: "Confirm Response", icon: CheckCircle, description: "When user confirms" },
    { key: "decline_message", label: "Decline Response", icon: XCircle, description: "When user declines" },
    { key: "fallback_message", label: "Fallback Response", icon: HelpCircle, description: "For unclear responses" },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Template Preview Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              {selectedTemplate?.org_name}
            </DialogTitle>
            <DialogDescription>
              ID: {selectedTemplate?.template_id || "Pending"}
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 mt-4">
              {messageFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <field.icon className="w-4 h-4" />
                    {field.label}
                  </Label>
                  <div className="p-3 rounded-md bg-muted text-sm leading-relaxed">
                    {selectedTemplate[field.key as keyof Template] as string}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-4">
                <Button onClick={handleUseTemplate} className="flex-1">
                  Use as Template
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Voice Templates</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage call script templates for {currentWorkspace?.name || "this workspace"}
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Workspace Variables Info */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
        <Info className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Available Placeholders for &quot;{currentWorkspace?.name || 'Workspace'}&quot;
          </p>
          {workspaceVariables.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {workspaceVariables.map((varName) => (
                <Badge key={varName} variant="secondary" className="font-mono text-xs">
                  {`{${varName}}`}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No variables found. Upload debtors with Excel to define your template variables.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            These placeholders will be replaced with each debtor&apos;s data when making calls.
          </p>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="animate-fade-in">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Create New Template</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {messageFields.map((field, index) => (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={field.key} className="text-sm font-medium">
                      {field.label}
                    </Label>
                    {index === 0 && workspaceVariables.length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                        {workspaceVariables.map((varName) => (
                          <Button
                            key={varName}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => insertPlaceholder(field.key, varName)}
                          >
                            + {varName}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                  <Textarea
                    id={field.key}
                    value={formData[field.key as keyof typeof formData]}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="min-h-[80px] resize-none"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org_name">Organization Name</Label>
                  <Input
                    id="org_name"
                    value={formData.org_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, org_name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="speaker_id">Speaker Voice</Label>
                  <Select
                    value={formData.speaker_id}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, speaker_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="523">👩 เสียงผู้หญิง 1 (ID: 523)</SelectItem>
                      <SelectItem value="524">👩 เสียงผู้หญิง 2 (ID: 524)</SelectItem>
                      <SelectItem value="525">👩 เสียงผู้หญิง 3 (ID: 525)</SelectItem>
                      <SelectItem value="500">👨 เสียงผู้ชาย 1 (ID: 500)</SelectItem>
                      <SelectItem value="501">👨 เสียงผู้ชาย 2 (ID: 501)</SelectItem>
                      <SelectItem value="502">👨 เสียงผู้ชาย 3 (ID: 502)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">เลือกเสียง Bot สำหรับการโทร</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createTemplateMutation.isPending}
                >
                  {createTemplateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Create Template
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Saved Templates ({templates?.length || 0})
        </h3>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid gap-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() => handleTemplateClick(template)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{template.org_name}</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {template.template_id || "pending"}
                    </Badge>
                    {template.is_system_default && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {template.message}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleTemplateClick(template)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {!template.is_system_default && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &quot;{template.org_name}&quot;? This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTemplateMutation.mutate(template.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No templates yet</p>
            <p className="text-sm">Create one to get started</p>
          </div>
        )}
      </div>

      {/* Test Call Dialog (5.5 - Campaign testing) */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4" />
            ทดสอบการโทร (Test Call)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            เลือก Template/แคมเปญ และใส่เบอร์โทรเพื่อทดสอบสคริปต่างๆ
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm">เลือก Template</Label>
              <Select value={testCallTemplateId} onValueChange={setTestCallTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือก Template" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {templates?.filter(t => t.template_id).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.org_name} {t.is_system_default ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">เบอร์โทรทดสอบ</Label>
              <Input
                placeholder="08x-xxx-xxxx"
                value={testCallPhone}
                onChange={(e) => setTestCallPhone(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={async () => {
                  const template = templates?.find(t => t.id === testCallTemplateId);
                  if (!template?.template_id || !testCallPhone) {
                    toast.error("กรุณาเลือก Template และใส่เบอร์โทร");
                    return;
                  }
                  try {
                    await makeCall({ phone_number: testCallPhone, variables: {} });
                    toast.success(`ทดสอบโทรไปยัง ${testCallPhone} ด้วย "${template.org_name}" สำเร็จ`);
                  } catch (err) {
                    toast.error("ทดสอบโทรล้มเหลว");
                    console.error(err);
                  }
                }}
                disabled={!testCallTemplateId || !testCallPhone}
                className="w-full"
              >
                <Phone className="w-4 h-4 mr-2" />
                โทรทดสอบ
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TemplateSetup;
