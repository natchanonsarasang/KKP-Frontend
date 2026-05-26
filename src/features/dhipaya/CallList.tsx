import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";

const DhipayaCallList = () => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Call List</h2>
        <p className="text-sm text-muted-foreground">
          Calling queue for Dhipaya customers
        </p>
      </div>

      <Card className="p-12 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Phone className="w-6 h-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Voicebot integration coming next</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This is an isolated calling queue for Dhipaya. Wire it to the voicebot
            once the Airtable Personal Access Token is configured and customers are loading.
          </p>
        </div>
        <Button disabled>Start Calling</Button>
      </Card>
    </div>
  );
};

export default DhipayaCallList;
