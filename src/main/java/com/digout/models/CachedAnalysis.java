package com.digout.models;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "cached_analysis", indexes = {
    @Index(name = "idx_product_name", columnList = "productName")
})
public class CachedAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String productName;

    @Lob
    @Column(columnDefinition = "TEXT", nullable = false)
    private String analysisResultJson;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        // Store in lowercase for case-insensitive exact matching
        this.productName = productName != null ? productName.toLowerCase().trim() : null;
    }

    public String getAnalysisResultJson() {
        return analysisResultJson;
    }

    public void setAnalysisResultJson(String analysisResultJson) {
        this.analysisResultJson = analysisResultJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
