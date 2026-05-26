import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Phone, RefreshCcw } from "lucide-react";
import { listCustomers } from "./api/airtable";
import { normalizeThaiPhone } from "./lib/phone";
import type { Customer } from "./types";

interface QueueItem {
  customer: Customer;
  rawPhone: string;
  phone: string; // normalized 0XXXXXXXXX
}

const DhipayaCallList = () => {
  const [calling, setCalling] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dhipaya-calllist-customers"],
    queryFn: () => listCustomers({ pageSize: 100 }),
  });

  const queue: QueueItem[] = useMemo(() => {
    const out: QueueItem[] = [];
    for (const c of data?.customers ?? []) {
      const raw = c.phone1 || c.phone2 || c.phone3;
      const phone = normalizeThaiPhone(raw);
      if (raw && phone) out.push({ customer: c, rawPhone: raw, phone });
    }
    return out;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Call List</h2>
          <p className="text-sm text-muted-foreground">
            Calling queue for Dhipaya customers (phones normalized to 0XXXXXXXXX)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            disabled={calling || queue.length === 0}
            onClick={() => setCalling(true)}
          >
            <Phone className="w-4 h-4 mr-2" />
            Start Calling ({queue.length})
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading queue...
          </div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">
            {(error as Error)?.message || "Failed to load customers."}
          </div>
        ) : queue.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No callable customers found. Make sure the Customer table has phone numbers.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Original</TableHead>
                <TableHead>Normalized</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Consent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map(({ customer: c, rawPhone, phone }) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{rawPhone}</TableCell>
                  <TableCell className="font-mono">{phone}</TableCell>
                  <TableCell>{c.campaign || "—"}</TableCell>
                  <TableCell>
                    {c.consentStatus ? (
                      <Badge variant="secondary">{c.consentStatus}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default DhipayaCallList;
