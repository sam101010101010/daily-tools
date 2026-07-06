FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY backend-java/pom.xml .
RUN mvn -q -e -B dependency:go-offline
COPY backend-java/src ./src
RUN mvn -q -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/daily-tools-backend-0.1.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
