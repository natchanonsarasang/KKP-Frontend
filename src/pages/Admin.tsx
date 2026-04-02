import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Shield,
  Coins,
  Users,
  Loader2,
  Plus,
  ArrowLeft,
  Crown,
} from "lucide-react";

interface UserWithTokens {
  id: string;
  email: string;
  tokens: number;
  isAdmin: boolean;
  created_at: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddTokensDialog, setShowAddTokensDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithTokens | null>(null);
  const [tokenAmount, setTokenAmount] = useState("");

  // Check if current user is admin
  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      return !!data;
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (!checkingAdmin && !isAdmin) {
      toast.error("Access denied. Admin only.");
      navigate("/dashboard");
    }
  }, [isAdmin, checkingAdmin, navigate]);

  // Fetch all users with their tokens
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin === true,
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, created_at");

      if (profilesError) throw profilesError;

      // Get all tokens
      const { data: tokens } = await supabase
        .from("call_tokens")
        .select("user_id, tokens");

      // Get all admin roles
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const tokensMap = new Map(tokens?.map(t => [t.user_id, t.tokens]) || []);
      const adminSet = new Set(adminRoles?.map(r => r.user_id) || []);

      return (profiles || []).map(p => ({
        id: p.id,
        email: p.email || "No email",
        tokens: tokensMap.get(p.id) ?? 0,
        isAdmin: adminSet.has(p.id),
        created_at: p.created_at,
      })) as UserWithTokens[];
    },
  });

  // Add tokens mutation
  const addTokensMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: string; amount: number }) => {
      const { data, error } = await supabase.rpc("add_tokens", {
        p_user_id: userId,
        p_amount: amount,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (newTokens) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Tokens added! New balance: ${newTokens}`);
      setShowAddTokensDialog(false);
      setTokenAmount("");
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add tokens");
    },
  });

  // Toggle admin role mutation
  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  const handleAddTokens = () => {
    if (!selectedUser || !tokenAmount) return;
    const amount = parseInt(tokenAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid positive number");
      return;
    }
    addTokensMutation.mutate({ userId: selectedUser.id, amount });
  };

  const openAddTokensDialog = (user: UserWithTokens) => {
    setSelectedUser(user);
    setTokenAmount("");
    setShowAddTokensDialog(true);
  };

  if (checkingAdmin || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-semibold">Admin Panel</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage users and call tokens
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <div className="text-2xl font-semibold">{users?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Total Users</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Coins className="w-8 h-8 text-warning" />
                <div>
                  <div className="text-2xl font-semibold">
                    {users?.reduce((sum, u) => sum + u.tokens, 0) || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Tokens</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Crown className="w-8 h-8 text-yellow-500" />
                <div>
                  <div className="text-2xl font-semibold">
                    {users?.filter(u => u.isAdmin).length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Admins</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Users</CardTitle>
            <CardDescription>Manage user tokens and roles</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : users && users.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4 text-warning" />
                            <span className="font-semibold">{user.tokens}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.isAdmin ? (
                            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                              <Crown className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary">User</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString("th-TH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAddTokensDialog(user)}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Tokens
                            </Button>
                            <Button
                              size="sm"
                              variant={user.isAdmin ? "destructive" : "secondary"}
                              onClick={() => toggleAdminMutation.mutate({
                                userId: user.id,
                                makeAdmin: !user.isAdmin,
                              })}
                              disabled={toggleAdminMutation.isPending}
                            >
                              {user.isAdmin ? "Remove Admin" : "Make Admin"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No users found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Tokens Dialog */}
      <Dialog open={showAddTokensDialog} onOpenChange={setShowAddTokensDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tokens</DialogTitle>
            <DialogDescription>
              Add call tokens to {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Current Balance</Label>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Coins className="w-5 h-5 text-warning" />
                {selectedUser?.tokens || 0} tokens
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-amount">Amount to Add</Label>
              <Input
                id="token-amount"
                type="number"
                min="1"
                placeholder="Enter amount"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddTokensDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddTokens}
                disabled={!tokenAmount || addTokensMutation.isPending}
              >
                {addTokensMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Tokens
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;