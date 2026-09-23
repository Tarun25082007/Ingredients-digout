# Stage 1: Build the application using a lightweight Maven image
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app

# Copy the pom.xml and download dependencies
COPY pom.xml .
# This step caches the dependencies to speed up future builds
RUN mvn dependency:go-offline -B

# Copy the source code and build the application
COPY src ./src
RUN mvn clean package -DskipTests

# Extract layers
RUN java -Djarmode=layertools -jar target/*.jar extract --destination target/extracted

# Stage 2: Create the runtime image using a lightweight JRE
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create a non-root user and group for security
RUN addgroup -S digoutgroup && adduser -S digoutuser -G digoutgroup

# Copy layers sequentially. Dependencies change rarely, application changes often.
COPY --from=builder --chown=digoutuser:digoutgroup /app/target/extracted/dependencies/ ./
COPY --from=builder --chown=digoutuser:digoutgroup /app/target/extracted/spring-boot-loader/ ./
COPY --from=builder --chown=digoutuser:digoutgroup /app/target/extracted/snapshot-dependencies/ ./
COPY --from=builder --chown=digoutuser:digoutgroup /app/target/extracted/application/ ./

# Switch to the non-root user
USER digoutuser

# Expose the application port (8443 for HTTPS)
EXPOSE 8443

# Command to run the application, optimizing JVM memory limits for containers
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "org.springframework.boot.loader.launch.JarLauncher"]
