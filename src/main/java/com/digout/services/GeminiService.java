package com.digout.services;

import com.digout.dto.WhoAssessmentDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class GeminiService {

    private final String geminiApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?key=";
    private static final String PROMPT = "Extract every ingredient from this image. Evaluate them against WHO guidelines. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String\", \"globalEquivalent\": \"String (highly popular global equivalent brand/product if this is regional, e.g. 'Fanta Orange' for 'Campa Orange', else same as productName)\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }. Ensure 'status' is strictly RED, YELLOW, or GREEN.";

    public GeminiService(@Value("${gemini.api.key}") String geminiApiKey, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.geminiApiKey = geminiApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                // Construct Gemini Interactions API Payload
                Map<String, Object> payload = Map.of(
                        "model", "gemini-2.5-flash",
                        "store", false,
                        "input", List.of(
                                Map.of("text", PROMPT),
                                Map.of("inlineData", Map.of(
                                        "mimeType", mimeType,
                                        "data", base64Image
                                ))
                        )
                );

                HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);

                // Parse the response
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode steps = root.path("steps");
                String jsonText = "";
                for (JsonNode step : steps) {
                    if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    } else if (step.has("model_output") && step.path("model_output").has("text")) {
                        jsonText = step.path("model_output").path("text").asText();
                        break;
                    }
                }

                if (jsonText.isEmpty()) {
                    throw new RuntimeException("No modelOutput found in response: " + response.getBody());
                }

                // Clean markdown JSON formatting if Gemini includes it despite responseMimeType
                if (jsonText.startsWith("```json")) {
                    jsonText = jsonText.substring(7, jsonText.length() - 3).trim();
                } else if (jsonText.startsWith("```")) {
                    jsonText = jsonText.substring(3, jsonText.length() - 3).trim();
                }

                return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000); // wait 2 seconds before retrying
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                }
                throw new RuntimeException("Failed to analyze ingredients with Gemini API: " + e.getMessage(), e);
            }
        }
        throw new RuntimeException("Failed to analyze ingredients with Gemini API after retries.");
    }
}
