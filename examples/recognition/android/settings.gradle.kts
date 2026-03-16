pluginManagement {
    includeBuild("../node_modules/@react-native/gradle-plugin")
}

plugins {
    id("com.facebook.react.settings")
}

extensions.configure(com.facebook.react.ReactSettingsExtension::class.java) { ex ->
    ex.autolinkLibrariesFromCommand()
}

includeBuild("../../../../.packages/AppReveal/Android") {
    dependencySubstitution {
        substitute(module("com.appreveal:appreveal")).using(project(":appreveal"))
        substitute(module("com.appreveal:appreveal-noop")).using(project(":appreveal-noop"))
    }
}

rootProject.name = "FacesRecognition"
include(":app")
