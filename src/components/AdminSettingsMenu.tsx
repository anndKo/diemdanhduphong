import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, ShieldCheck, UserPlus, Key, LogOut, Menu, MessageSquareWarning, KeyRound, UserCheck, Shield, ShieldAlert, BookPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AdminSettingsMenuProps {
  isAdmin: boolean;
  onProtectionPassword: () => void;
  onCreateTeacher: () => void;
  onChangePassword: () => void;
  onViewReports: () => void;
  onResetPasswords?: () => void;
  onProtectionResetRequests?: () => void;
  onAccountRequests?: () => void;
  onSecurityManagement?: () => void;
  onCreateGuide?: () => void;
  onLogout: () => void;
  isMobile?: boolean;
}

interface BadgeCounts {
  reports: number;
  protectionResets: number;
  passwordResets: number;
  accountRequests: number;
}

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full bg-destructive text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
};

const AdminSettingsMenu = ({
  isAdmin,
  onProtectionPassword,
  onCreateTeacher,
  onChangePassword,
  onViewReports,
  onResetPasswords,
  onProtectionResetRequests,
  onAccountRequests,
  onSecurityManagement,
  onCreateGuide,
  onLogout,
  isMobile = false,
}: AdminSettingsMenuProps) => {
  const [counts, setCounts] = useState<BadgeCounts>({ reports: 0, protectionResets: 0, passwordResets: 0, accountRequests: 0 });

  useEffect(() => {
    if (!isAdmin) return;
    const fetchCounts = async () => {
      try {
        const [reportsRes, protectionRes, passwordRes, accountRes] = await Promise.all([
          supabase.from("bug_reports" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("protection_password_attempts" as any).select("*", { count: "exact", head: true }).not("blocked_until", "is", null),
          supabase.from("password_reset_requests" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("account_requests" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
        ]);
        setCounts({
          reports: reportsRes.count || 0,
          protectionResets: protectionRes.count || 0,
          passwordResets: passwordRes.count || 0,
          accountRequests: accountRes.count || 0,
        });
      } catch (e) {
        console.error("Badge count error:", e);
      }
    };
    fetchCounts();
  }, [isAdmin]);

  const totalBadge = counts.reports + counts.protectionResets + counts.passwordResets + counts.accountRequests;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={isMobile ? "icon" : "default"} className="shrink-0 relative">
          {isMobile ? (
            <Menu className="w-5 h-5" />
          ) : (
            <>
              <Settings className="w-4 h-4 mr-2" />
              Cài đặt
            </>
          )}
          {isAdmin && totalBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={onProtectionPassword} className="cursor-pointer">
          <ShieldCheck className="w-4 h-4 mr-2" />
          Mật khẩu bảo vệ
        </DropdownMenuItem>
        
        {isAdmin && (
          <DropdownMenuItem onClick={onCreateTeacher} className="cursor-pointer">
            <UserPlus className="w-4 h-4 mr-2" />
            Tạo tài khoản GV
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={onChangePassword} className="cursor-pointer">
          <Key className="w-4 h-4 mr-2" />
          Đổi mật khẩu
        </DropdownMenuItem>
        
        {isAdmin && (
          <DropdownMenuItem onClick={onViewReports} className="cursor-pointer">
            <MessageSquareWarning className="w-4 h-4 mr-2" />
            Các báo cáo
            <Badge count={counts.reports} />
          </DropdownMenuItem>
        )}
        
        {isAdmin && onProtectionResetRequests && (
          <DropdownMenuItem onClick={onProtectionResetRequests} className="cursor-pointer">
            <ShieldAlert className="w-4 h-4 mr-2" />
            Cấp lại MK bảo vệ
            <Badge count={counts.protectionResets} />
          </DropdownMenuItem>
        )}
        
        {isAdmin && onResetPasswords && (
          <DropdownMenuItem onClick={onResetPasswords} className="cursor-pointer">
            <KeyRound className="w-4 h-4 mr-2" />
            Cấp lại mật khẩu TK
            <Badge count={counts.passwordResets} />
          </DropdownMenuItem>
        )}
        
        {isAdmin && onAccountRequests && (
          <DropdownMenuItem onClick={onAccountRequests} className="cursor-pointer">
            <UserCheck className="w-4 h-4 mr-2" />
            Yêu cầu đăng ký TK
            <Badge count={counts.accountRequests} />
          </DropdownMenuItem>
        )}
        
        {isAdmin && onSecurityManagement && (
          <DropdownMenuItem onClick={onSecurityManagement} className="cursor-pointer">
            <Shield className="w-4 h-4 mr-2" />
            Quản lí bảo mật
          </DropdownMenuItem>
        )}

        {isAdmin && onCreateGuide && (
          <DropdownMenuItem onClick={onCreateGuide} className="cursor-pointer">
            <BookPlus className="w-4 h-4 mr-2" />
            Tạo hướng dẫn
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AdminSettingsMenu;
