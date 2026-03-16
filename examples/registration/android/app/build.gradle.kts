apply(plugin = "com.android.application")
apply(plugin = "org.jetbrains.kotlin.android")
apply(plugin = "com.facebook.react")

android {
    namespace = "com.facesregistration"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.facesregistration"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.facebook.react:hermes-android")
    debugImplementation("com.appreveal:appreveal:0.2.0")
    releaseImplementation("com.appreveal:appreveal-noop:0.2.0")
}
