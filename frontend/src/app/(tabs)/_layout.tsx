import { Redirect, Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/store/auth';

export default function TabsLayout() {
  const { status } = useAuth();

  // Don't let a signed-out user reach the app. While auth is still resolving,
  // render nothing (the splash route owns the loading moment).
  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Nova' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
