import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, PhoneCall, Search } from "lucide-react";
import { getAICategoryBadge, getConfidenceMeter, getOutcomeBadge, getStatusBadge } from "./StatusBadges";
import { ConversationLogCell } from "./ConversationLogCell";
import type { EnrichedCallRecord } from "./types";

interface CallHistoryTabProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filteredRecords: EnrichedCallRecord[];
  onExportExcel: () => void;
}

export function CallHistoryTab({ searchQuery, onSearchQueryChange, filteredRecords, onExportExcel }: CallHistoryTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Recent Calls</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาเบอร์หรือชื่อ..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="pl-8 h-9 w-[200px] text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={onExportExcel} disabled={filteredRecords.length === 0}>
              <Download className="w-4 h-4 mr-1" />
              Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredRecords.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">เบอร์โทร</TableHead>
                  <TableHead className="text-xs">ชื่อ</TableHead>
                  <TableHead className="text-xs">ยอด</TableHead>
                  <TableHead className="text-xs">ผลการโทร</TableHead>
                  <TableHead className="text-xs">ผล AI</TableHead>
                  <TableHead className="text-xs">ความมั่นใจ</TableHead>
                  <TableHead className="text-xs">เหตุผล AI</TableHead>
                  <TableHead className="text-xs">บทสนทนา</TableHead>
                  <TableHead className="text-xs">สถานะ</TableHead>
                  <TableHead className="text-xs">เวลา</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 100).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-sm">{record.phone_number}</TableCell>
                    <TableCell className="text-sm">{record.debtor_name || "-"}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const n = Number(record.amount);
                        return record.amount
                          ? Number.isFinite(n)
                            ? `฿${new Intl.NumberFormat("th-TH").format(n)}`
                            : `฿${record.amount}`
                          : "-";
                      })()}
                    </TableCell>
                    <TableCell>{getOutcomeBadge(record.call_outcome, record.picked_up)}</TableCell>
                    <TableCell>{getAICategoryBadge(record.ai_category)}</TableCell>
                    <TableCell>
                      {record.ai_reason ? (
                        getConfidenceMeter(record.ai_confidence)
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      {record.ai_reason ? (
                        <p className="text-xs text-muted-foreground truncate" title={record.ai_reason}>
                          {record.ai_reason}
                        </p>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell><ConversationLogCell record={record} /></TableCell>
                    <TableCell>{getStatusBadge(record.status || "pending")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(record.created_at).toLocaleString("th-TH", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <PhoneCall className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>{searchQuery ? "ไม่พบผลลัพธ์" : "ยังไม่มีประวัติการโทร"}</p>
            <p className="text-sm">{searchQuery ? "ลองค้นหาด้วยคำอื่น" : "เริ่มแคมเปญเพื่อดูผลลัพธ์ที่นี่"}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
