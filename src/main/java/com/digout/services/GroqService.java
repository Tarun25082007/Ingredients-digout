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
public class GroqService {

    private final String groqApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    private static final String GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
    
    private static final String PROMPT = "Extract every ingredient from this image. Evaluate them against WHO guidelines. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String\", \"globalEquivalent\": \"String (highly popular global equivalent brand/product if this is regional, e.g. 'Fanta Orange' for 'Campa Orange', else same as productName)\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }. Ensure 'status' is strictly RED, YELLOW, or GREEN.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. We have retrieved the following exact ingredients from the database: '%s'. Evaluate these EXACT ingredients against WHO guidelines. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String (the actual corrected/identified product name)\", \"globalEquivalent\": \"String (the globally popular equivalent if regional)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name with percentage if available)\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }. Ensure 'status' is strictly RED, YELLOW, or GREEN.";

    public GroqService(@Value("${groq.api.key}") String groqApiKey, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.groqApiKey = groqApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(groqApiKey);

            String base64Prefix = "data:" + mimeType + ";base64,";
            
            Map<String, Object> payload = Map.of(
                    "model", "llama-3.2-11b-vision-preview",
                    "messages", List.of(
                            Map.of(
                                    "role", "user",
                                    "content", List.of(
                                            Map.of("type", "text", "text", PROMPT),
                                            Map.of("type", "image_url", "image_url", Map.of("url", base64Prefix + base64Image))
                                    )
                            )
                    )
            );

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_API_URL, request, String.class);

            String jsonText = extractResponseText(response.getBody());
            return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
        } catch (Exception e) {
            throw new RuntimeException("Fallback Groq AI failed to analyze image: " + e.getMessage(), e);
        }
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(groqApiKey);

            String formattedPrompt = String.format(TEXT_PROMPT, productName.replace("'", ""), ingredientsText != null ? ingredientsText.replace("'", "") : "No ingredients available");
            
            Map<String, Object> payload = Map.of(
                    "model", "llama3-8b-8192",
                    "messages", List.of(
                            Map.of("role", "user", "content", formattedPrompt)
                    )
            );

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_API_URL, request, String.class);

            String jsonText = extractResponseText(response.getBody());
            return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
        } catch (Exception e) {
            throw new RuntimeException("Fallback Groq AI failed to analyze name: " + e.getMessage(), e);
        }
    }

    private String extractResponseText(String body) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && choices.size() > 0) {
            String rawText = choices.get(0).path("message").path("content").asText("");
            return extractJson(rawText);
        }
        throw new RuntimeException("No choices found in Groq response");
    }

    private String extractJson(String rawText) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL).matcher(rawText);
        if (matcher.find()) {
            return matcher.group();
        }
        return rawText;
    }
}
