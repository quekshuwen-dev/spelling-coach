import { Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import ProfileSwitcher from './components/ProfileSwitcher'
import { Toast } from './components/ui'
import { useApp } from './context/AppContext'
import HomeScreen from './screens/HomeScreen'
import ScanScreen from './screens/ScanScreen'
import WordListScreen from './screens/WordListScreen'
import TestScreen from './screens/TestScreen'
import ProgressScreen from './screens/ProgressScreen'
import SettingsScreen from './screens/SettingsScreen'

export default function App() {
  const { toast } = useApp()
  return (
    <>
      <ProfileSwitcher />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/scan" element={<ScanScreen />} />
        <Route path="/words" element={<WordListScreen />} />
        <Route path="/test" element={<TestScreen />} />
        <Route path="/progress" element={<ProgressScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<HomeScreen />} />
      </Routes>
      <BottomNav />
      <Toast message={toast} />
    </>
  )
}
