import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/store/auth';
import { ConversationsProvider } from '@/store/conversations';
import { TasksProvider } from '@/store/tasks';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TasksProvider>
          <ConversationsProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Colors.bg },
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="task/[id]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </ConversationsProvider>
        </TasksProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
