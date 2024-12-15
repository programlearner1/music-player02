// Phone Auto Silencer - Kotlin-based Example for Geofencing (Core Functionality)

import android.manifest

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.RequiresApi
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices

class PhoneAutoSilencer(private val context: Context) {

    private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(context)
    private val geofenceList: MutableList<Geofence> = mutableListOf()

    fun requestPermissions() {
        // Request location permissions from the user
        // Implementation depends on your Activity/Fragment
        println("Ensure permissions are granted for location access.")
    }

    fun addGeofence(latitude: Double, longitude: Double, radius: Float, requestId: String) {
        val geofence = Geofence.Builder()
            .setRequestId(requestId)
            .setCircularRegion(latitude, longitude, radius)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
            .build()

        geofenceList.add(geofence)
        println("Geofence added: $requestId")
    }

    @RequiresApi(Build.VERSION_CODES.M)
    fun initializeGeofencing() {
        if (geofenceList.isNotEmpty()) {
            val geofencingRequest = GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(geofenceList)
                .build()

            val geofencePendingIntent: PendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                Intent(context, GeofenceBroadcastReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT
            )

            geofencingClient.addGeofences(geofencingRequest, geofencePendingIntent)
                .addOnSuccessListener {
                    println("Geofencing initialized successfully.")
                    Toast.makeText(context, "Geofences added successfully", Toast.LENGTH_SHORT).show()
                }
                .addOnFailureListener {
                    println("Failed to initialize geofencing: ${it.message}")
                    Toast.makeText(context, "Failed to add geofences", Toast.LENGTH_SHORT).show()
                }
        } else {
            println("No geofences to initialize.")
        }
    }

    fun switchToSilentMode() {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.ringerMode = AudioManager.RINGER_MODE_SILENT
        Toast.makeText(context, "Switched to Silent Mode", Toast.LENGTH_SHORT).show()
        println("Switched to Silent Mode.")
    }

    fun switchToGeneralMode() {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.ringerMode = AudioManager.RINGER_MODE_NORMAL
        Toast.makeText(context, "Switched to General Mode", Toast.LENGTH_SHORT).show()
        println("Switched to General Mode.")
    }

    fun listGeofences(): List<String> {
        return geofenceList.map { it.requestId }
    }

    fun removeGeofence(requestId: String) {
        geofencingClient.removeGeofences(listOf(requestId))
            .addOnSuccessListener {
                println("Geofence removed: $requestId")
                Toast.makeText(context, "Geofence $requestId removed", Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener {
                println("Failed to remove geofence: ${it.message}")
                Toast.makeText(context, "Failed to remove geofence $requestId", Toast.LENGTH_SHORT).show()
            }
    }
}

// Broadcast Receiver to handle geofence transitions
class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val geofencingEvent = GeofencingEvent.fromIntent(intent)

        if (geofencingEvent != null && geofencingEvent.hasError()) {
            println("Geofencing error: ${geofencingEvent.errorCode}")
            return
        }

        when (geofencingEvent?.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> {
                println("Geofence entered.")
                PhoneAutoSilencer(context).switchToSilentMode()
            }
            Geofence.GEOFENCE_TRANSITION_EXIT -> {
                println("Geofence exited.")
                PhoneAutoSilencer(context).switchToGeneralMode()
            }
            else -> println("Unknown geofence transition.")
        }
    }
}

// Example Usage in an Activity or Service
fun main(context: Context) {
    val phoneSilencer = PhoneAutoSilencer(context)

    phoneSilencer.requestPermissions()
    phoneSilencer.addGeofence(37.7749, -122.4194, 100f, "Home")
    phoneSilencer.addGeofence(37.7749, -122.4313, 150f, "Office")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        phoneSilencer.initializeGeofencing()
    }

    // Example for listing geofences
    val geofences = phoneSilencer.listGeofences()
    println("Current Geofences: $geofences")

    // Example for removing a geofence
    phoneSilencer.removeGeofence("Home")
}
