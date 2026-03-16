pluginManagement {
    includeBuild("../node_modules/@react-native/gradle-plugin")
}

plugins {
    id("com.facebook.react.settings")
}

extensions.configure(com.facebook.react.ReactSettingsExtension::class.java) { ex ->
    ex.autolinkLibrariesFromCommand()
}

rootProject.name = "FacesRecognition"
include(":app")
