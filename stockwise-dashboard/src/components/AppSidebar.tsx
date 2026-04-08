import { LayoutDashboard, Package, ShoppingCart, Bell, BarChart3, LogOut, Zap } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const allNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, roles: ['admin', 'distributor'] },
  { title: 'Inventory', url: '/inventory', icon: Package, roles: ['admin', 'distributor'] },
  { title: 'Orders', url: '/orders', icon: ShoppingCart, roles: ['admin', 'distributor'] },
  { title: 'Analytics', url: '/analytics', icon: BarChart3, roles: ['admin'] },
  { title: 'AI Intelligence', url: '/ai', icon: Zap, roles: ['admin'] },
  { title: 'Notifications', url: '/notifications', icon: Bell, roles: ['admin', 'distributor'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = allNavItems.filter(item => user && item.roles.includes(user.role));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg gradient-purple flex items-center justify-center flex-shrink-0">
            <Package className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold text-sidebar-primary-foreground">Inventra</h1>
              <p className="text-xs text-sidebar-foreground/60">Management Suite</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs uppercase tracking-wider">
            {!collapsed && 'Navigation'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <NavLink
                        to={item.url}
                        end
                        className="transition-all duration-200"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 mr-2" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && user && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div className="h-7 w-7 rounded-full gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-primary-foreground truncate">{user.name}</p>
                <p className="text-[10px] text-sidebar-foreground/50 capitalize">{user.role === 'admin' ? 'Admin / Mgmt' : 'Distributor'}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground text-xs h-8"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Sign Out
            </Button>
          </div>
        )}
        {collapsed && (
          <Button variant="ghost" size="icon" onClick={logout} className="w-full h-8 text-sidebar-foreground/60">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
