package com.digout.controllers;

import com.digout.dto.OpenFoodFactsDTO;
import com.digout.services.OpenFoodFactsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/compare")
public class ComparisonController {

    private final OpenFoodFactsService openFoodFactsService;

    public ComparisonController(OpenFoodFactsService openFoodFactsService) {
        this.openFoodFactsService = openFoodFactsService;
    }

    @GetMapping("/{barcode}")
    public ResponseEntity<?> compareProduct(@PathVariable String barcode) {
        try {
            OpenFoodFactsDTO data = openFoodFactsService.fetchInternationalVariants(barcode);
            return ResponseEntity.ok(data);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
