import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listCustomers } from "./api/airtable";
import { Loader2, RefreshCcw, ArrowRight } from "lucide-react";

interface Props {
  onNextStep: () => void;
}

const DhipayaCustomersList = ({ onNextStep }: Props) => {
  const [offsetStack, setOffsetStack] = useState<(string | undefined)[]>([undefined]);
  const currentOffset = offsetStack[offsetStack.length - 1];

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dhipaya-customers", currentOffset],
    queryFn: () => listCustomers({ pageSize: 50, offset: currentOffset }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Customers</h2>
          <p className="text-sm text-muted-foreground">Live data from Airtable</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={onNextStep}>
            Next: Call List
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading customers...
          </div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">
            {(error as Error)?.message || "Failed to load customers."}
            <p className="mt-2 text-muted-foreground">
              Make sure the Airtable secrets <code>AIRTABLE_PAT</code> and <code>AIRTABLE_BASE_ID</code> are set, and that you have the <code>dhipaya</code> role.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Routing</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Consent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                data?.customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                      {c.duplicateFlag && (
                        <Badge variant="outline" className="ml-2">dup</Badge>
                      )}
                    </TableCell>
                    <TableCell>{c.phone1 || c.phone2 || c.phone3 || "—"}</TableCell>
                    <TableCell>{c.routingGroup || "—"}</TableCell>
                    <TableCell>{c.campaign || "—"}</TableCell>
                    <TableCell>
                      {c.consentStatus ? (
                        <Badge variant="secondary">{c.consentStatus}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={offsetStack.length <= 1}
          onClick={() => setOffsetStack((s) => s.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.offset}
          onClick={() => data?.offset && setOffsetStack((s) => [...s, data.offset])}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default DhipayaCustomersList;
