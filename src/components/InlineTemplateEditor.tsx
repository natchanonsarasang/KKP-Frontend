import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, CheckCircle, XCircle, HelpCircle, Loader2, Save, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Template {
  id: string;
  template_id: string | null;
  message: string;
  confirm_message: string;
  decline_message: string;
  fallback_message: string;
  org_name: string;
  speaker_id: string;
  workspace_id: string | null;
}

const InlineTemplateEditor = () => {
  const queryClient = useQueryClient();
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    message: "",
    confirm_message: "",
    decline_message: "",
    fallback_message: "",
    org_name: "บอทน้อย",
    speaker_id: "523",
  });

  // Fetch available variables from current workspace's debtors
  const { data: workspaceVariables = [] } = useQuery({
    queryKey: ["workspace-variables", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];

      const { data, error } = await supabase
        .from("debtors")
        .select("variables")
        .eq("workspace_id", currentWorkspace.id)
        .limit(100);

      if (error) throw error;
      
      const allKeys = new Set<string>();
      data?.forEach((d) => {
        const vars = d.variables as Record<string, unknown> | null;
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

  // Fetch existing template for current workspace
  const { data: existingTemplate, isLoading } = useQuery({
    queryKey: ["workspace-template", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;

      const { data, error } = await supabase
        .from("call_templates")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Template | null;
    },
    enabled: !!currentWorkspace?.id,
  });

  // Populate form when template loads
  useEffect(() => {
    if (existingTemplate) {
      setFormData({
        message: existingTemplate.message,
        confirm_message: existingTemplate.confirm_message,
        decline_message: existingTemplate.decline_message,
        fallback_message: existingTemplate.fallback_message,
        org_name: existingTemplate.org_name,
        speaker_id: existingTemplate.speaker_id,
      });
    } else {
      // Default values for new template
      setFormData({
        message: "สวัสดีค่ะ จากบอทน้อยนะคะ คุณมียอดค้างชำระ กำหนดชำระนะคะ ไม่ทราบว่าสามารถยืนยันการชำระได้มั้ยคะ",
        confirm_message: "ขอบคุณค่ะ คุณได้ยืนยันการชำระเรียบร้อยแล้วค่ะ",
        decline_message: "ขอบคุณค่ะ หากคุณต้องการเปลี่ยนแปลง สามารถแจ้งเราได้เลยนะคะ",
        fallback_message: "ขอบคุณค่ะ หากคุณต้องการสอบถามเพิ่มเติม สามารถแจ้งเราได้เลยนะคะ",
        org_name: "บอทน้อย",
        speaker_id: "523",
      });
    }
  }, [existingTemplate]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!effectiveUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      // Call Botnoi API to create/update template
      const { data: apiResponse, error: apiError } = await supabase.functions.invoke(
        "botnoi-create-template",
        { body: data }
      );

      if (apiError) throw apiError;

      if (existingTemplate) {
        // Update existing template
        const { error: dbError } = await supabase
          .from("call_templates")
          .update({
            ...data,
            template_id: apiResponse?.template_id || existingTemplate.template_id,
          })
          .eq("id", existingTemplate.id);

        if (dbError) throw dbError;
      } else {
        // Create new template
        const { error: dbError } = await supabase
          .from("call_templates")
          .insert({
            ...data,
            template_id: apiResponse?.template_id || null,
            user_id: effectiveUserId,
            workspace_id: currentWorkspace.id,
          });

        if (dbError) throw dbError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-template"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template saved successfully");
    },
    onError: (error) => {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const insertPlaceholder = (field: string, placeholder: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field as keyof typeof prev] + ` {${placeholder}}`,
    }));
  };

  const messageFields = [
    { key: "message", label: "Main Message", icon: MessageSquare, description: "Initial greeting when call starts" },
    { key: "confirm_message", label: "Confirm Response", icon: CheckCircle, description: "When user confirms payment" },
    { key: "decline_message", label: "Decline Response", icon: XCircle, description: "When user declines" },
    { key: "fallback_message", label: "Fallback Response", icon: HelpCircle, description: "For unclear responses" },
  ];

  if (!currentWorkspace) return null;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Call Script Template</CardTitle>
                {existingTemplate?.template_id && (
                  <Badge variant="outline" className="text-xs font-mono">
                    ID: {existingTemplate.template_id}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Available Variables */}
                {workspaceVariables.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium">Available Placeholders</p>
                      <div className="flex flex-wrap gap-1.5">
                        {workspaceVariables.map((varName) => (
                          <Badge key={varName} variant="secondary" className="font-mono text-xs">
                            {`{${varName}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Message Fields */}
                <div className="grid gap-4 md:grid-cols-2">
                  {messageFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <field.icon className="w-4 h-4 text-muted-foreground" />
                        <Label htmlFor={field.key} className="text-sm font-medium">
                          {field.label}
                        </Label>
                      </div>
                      <Textarea
                        id={field.key}
                        value={formData[field.key as keyof typeof formData]}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.description}
                        className="min-h-[100px] resize-none text-sm"
                      />
                      {field.key === "message" && workspaceVariables.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {workspaceVariables.slice(0, 5).map((varName) => (
                            <Button
                              key={varName}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => insertPlaceholder(field.key, varName)}
                            >
                              + {varName}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Organization & Speaker */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="org_name" className="text-sm">Organization Name</Label>
                    <Input
                      id="org_name"
                      value={formData.org_name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, org_name: e.target.value }))
                      }
                      placeholder="Your organization"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="speaker_id" className="text-sm">Speaker ID</Label>
                    <Input
                      id="speaker_id"
                      value={formData.speaker_id}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, speaker_id: e.target.value }))
                      }
                      placeholder="523"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Template
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default InlineTemplateEditor;
