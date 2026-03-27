package expo.modules.termuxbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

class ShellyForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "shelly_terminal"
        private const val NOTIFICATION_ID = 1
        private var isRunning = false

        fun start(context: Context) {
            if (isRunning) return
            val intent = Intent(context, ShellyForegroundService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            if (!isRunning) return
            val intent = Intent(context, ShellyForegroundService::class.java)
            context.stopService(intent)
        }

        fun running(): Boolean = isRunning
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Shelly")
            .setContentText("Terminal session active")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .build()
        startForeground(NOTIFICATION_ID, notification)
        isRunning = true
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Terminal Session",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Keeps terminal sessions alive in background"
            setShowBadge(false)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }
}
